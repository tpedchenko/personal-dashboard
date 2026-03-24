"""Database backend abstraction: SQLite and PostgreSQL.

Provides a unified connection interface so the rest of the codebase
(database.py, garmin.py, etc.) can work with either backend transparently.

Selection: set DB_BACKEND=postgres env var + DATABASE_URL for PostgreSQL.
Default: SQLite (no config needed).

This package re-exports all public and internal symbols so that existing
imports like ``from src.db_backend import X`` continue to work unchanged.
"""

# ─── Config & detection (defined here so patches on src.db_backend.DB_BACKEND work) ─
import os as _os

DB_BACKEND = _os.environ.get("DB_BACKEND", "sqlite").lower()
DATABASE_URL = _os.environ.get("DATABASE_URL", "")


def is_postgres() -> bool:
    return DB_BACKEND == "postgres"

# ─── Re-export: query counter ────────────────────────────────────────────────
from .counter import reset_query_count, get_query_count, _increment_query_count

# ─── Re-export: SQL translation ──────────────────────────────────────────────
from .translate import _translate_sql, _CONFLICT_COLUMNS

# ─── Re-export: user scope / injection ───────────────────────────────────────
from .user_scope import (
    _PER_USER_TABLES,
    _inject_user_id,
    _current_pg_user_id,
    _get_user_id_for_email,
    _user_id_cache,
    _user_id_cache_lock,
)

# ─── Re-export: wrappers & pool ─────────────────────────────────────────────
from .wrappers import (
    _DummyCursor,
    _PgCursorWrapper,
    _PgConnectionWrapper,
    get_pg_connection,
    return_pg_connection,
    pg_table_info,
    pg_table_exists,
)

__all__ = [
    # Config
    "DB_BACKEND",
    "DATABASE_URL",
    "is_postgres",
    # Query counter
    "reset_query_count",
    "get_query_count",
    "_increment_query_count",
    # SQL translation
    "_translate_sql",
    "_CONFLICT_COLUMNS",
    # User scope
    "_PER_USER_TABLES",
    "_inject_user_id",
    "_current_pg_user_id",
    "_get_user_id_for_email",
    "_user_id_cache",
    "_user_id_cache_lock",
    # Wrappers
    "_DummyCursor",
    "_PgCursorWrapper",
    "_PgConnectionWrapper",
    "get_pg_connection",
    "return_pg_connection",
    "pg_table_info",
    "pg_table_exists",
]
