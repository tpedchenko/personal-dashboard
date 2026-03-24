"""Cursor and connection wrappers for PostgreSQL (sqlite3-compatible interface).

Also contains connection pool management and PRAGMA table_info emulation.
"""

import logging
import threading

from .counter import _increment_query_count

_log = logging.getLogger(__name__)


# ─── PostgreSQL cursor wrapper ──────────────────────────────────────────────


class _PgCursorWrapper:
    """Wraps psycopg2 cursor to match sqlite3.Cursor interface."""

    def __init__(self, pg_cursor):
        self._cur = pg_cursor

    @property
    def description(self):
        return self._cur.description

    @property
    def lastrowid(self):
        return self._cur.fetchone()[0] if self._cur.description else None

    @property
    def rowcount(self):
        return self._cur.rowcount

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def __iter__(self):
        return iter(self._cur)


class _PgConnectionWrapper:
    """Wraps psycopg2 connection to match sqlite3.Connection interface.

    Key differences handled:
    - Translates ? -> %s placeholders
    - Translates SQLite functions to PG equivalents
    - Ignores PRAGMA statements
    - Adds RETURNING id for INSERT statements
    - Context manager commits on exit and returns connection to pool
    """

    def __init__(self, pg_conn, pool=None):
        self._conn = pg_conn
        self._pool = pool
        self._in_context = False
        self._returned = False

    def execute(self, sql: str, params=None):
        import src.db_backend as _pkg
        _increment_query_count()
        # Auto-inject user_id for per-user tables
        sql, params = _pkg._inject_user_id(sql, params or (), self._conn)

        translated = _pkg._translate_sql(sql)
        if not translated:
            # PRAGMA or empty -> return a dummy cursor
            return _DummyCursor()

        # For INSERT with AUTOINCREMENT/SERIAL, add RETURNING to get lastrowid
        needs_returning = False
        if (translated.strip().upper().startswith("INSERT")
                and "RETURNING" not in translated.upper()):
            needs_returning = True
            translated = translated.rstrip().rstrip(";") + " RETURNING *"

        try:
            cur = self._conn.cursor()
            cur.execute(translated, params or ())
            return _PgCursorWrapper(cur)
        except Exception as e:
            self._conn.rollback()
            # Re-raise with SQL context for debugging
            _log.error("PG execute error: %s\nSQL: %s\nParams: %s", e, translated[:500], params)
            raise

    def executemany(self, sql: str, params_list):
        import src.db_backend as _pkg
        _increment_query_count()
        # Auto-inject user_id for per-user tables (same SQL, different params)
        if params_list:
            sql, first_params = _pkg._inject_user_id(sql, params_list[0], self._conn)
            # If user_id was injected (params grew), inject for all rows
            if len(first_params) > len(params_list[0]):
                uid = first_params[0]  # user_id is always first param after injection
                params_list = [tuple([uid] + list(p)) for p in params_list]
            else:
                params_list[0] = first_params

        translated = _pkg._translate_sql(sql)
        if not translated:
            return
        cur = self._conn.cursor()
        try:
            cur.executemany(translated, params_list)
        except Exception as e:
            self._conn.rollback()
            raise

    def executescript(self, sql: str):
        """Execute multiple SQL statements (used for schema creation)."""
        cur = self._conn.cursor()
        cur.execute(sql)
        self._conn.commit()

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def cursor(self):
        return self._conn.cursor()

    def __enter__(self):
        self._in_context = True
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._in_context = False
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        self._return_to_pool()
        return False

    def _return_to_pool(self):
        """Return the underlying connection to the pool."""
        if self._returned or self._pool is None:
            return
        self._returned = True
        try:
            self._pool.putconn(self._conn)
        except Exception:
            pass


class _DummyCursor:
    """Dummy cursor returned for PRAGMA and other no-op statements."""
    description = None
    lastrowid = None
    rowcount = 0

    def fetchone(self):
        return None

    def fetchall(self):
        return []

    def __iter__(self):
        return iter([])


# ─── Connection pool for PostgreSQL ─────────────────────────────────────────

_pg_pool = None
_pg_pool_lock = threading.Lock()


def _get_pg_pool():
    global _pg_pool
    if _pg_pool is not None:
        return _pg_pool

    with _pg_pool_lock:
        if _pg_pool is not None:
            return _pg_pool

        import psycopg2
        from psycopg2 import pool

        import src.db_backend as _pkg
        url = _pkg.DATABASE_URL
        if not url:
            raise RuntimeError("DATABASE_URL not set")

        _pg_pool = pool.ThreadedConnectionPool(
            minconn=2, maxconn=20, dsn=url
        )
        _log.info("PostgreSQL connection pool created (2-20 connections)")
        return _pg_pool


def get_pg_connection() -> _PgConnectionWrapper:
    """Get a PostgreSQL connection from the pool, wrapped for sqlite3 compatibility.

    Must be used as a context manager (``with get_pg_connection() as conn:``)
    so the underlying connection is returned to the pool on exit.
    """
    p = _get_pg_pool()
    conn = p.getconn()
    conn.autocommit = False
    return _PgConnectionWrapper(conn, pool=p)


def return_pg_connection(wrapper: _PgConnectionWrapper):
    """Return a PostgreSQL connection to the pool."""
    pool = _get_pg_pool()
    pool.putconn(wrapper._conn)


# ─── PRAGMA table_info emulation for PostgreSQL ────────────────────────────

def pg_table_info(conn_wrapper: _PgConnectionWrapper, table_name: str) -> list:
    """Emulate SQLite's PRAGMA table_info for PostgreSQL.

    Returns list of tuples: (cid, name, type, notnull, dflt_value, pk)
    """
    sql = """
        SELECT ordinal_position - 1, column_name, data_type,
               CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END,
               column_default,
               0
        FROM information_schema.columns
        WHERE table_name = %s AND table_schema = 'public'
        ORDER BY ordinal_position
    """
    cur = conn_wrapper._conn.cursor()
    cur.execute(sql, (table_name,))
    rows = cur.fetchall()
    # Mark primary key columns
    pk_sql = """
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = %s::regclass AND i.indisprimary
    """
    try:
        cur.execute(pk_sql, (table_name,))
        pk_cols = {r[0] for r in cur.fetchall()}
    except Exception:
        pk_cols = set()

    result = []
    for row in rows:
        is_pk = 1 if row[1] in pk_cols else 0
        result.append((row[0], row[1], row[2], row[3], row[4], is_pk))
    return result


def pg_table_exists(conn_wrapper: _PgConnectionWrapper, table_name: str) -> bool:
    """Check if a table exists in PostgreSQL."""
    cur = conn_wrapper._conn.cursor()
    cur.execute(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = %s AND table_schema = 'public')",
        (table_name,),
    )
    return cur.fetchone()[0]
