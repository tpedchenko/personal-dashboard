"""Demo mode: persistent demo data stored as a separate user.

In PostgreSQL: demo data is stored with user_id of the demo user (demo@pd-app.local).
In SQLite: demo data is in a separate per-user DB file.

Data is generated once and persisted — not regenerated on each visit.
"""
import sqlite3
from pathlib import Path

# Re-export the public constants from demo_data
from src.demo_data import DEMO_ACCOUNTS, DEFAULT_CATEGORIES


def get_demo_db_path() -> Path:
    """Return the path to the demo database (SQLite only)."""
    from src.database import _user_db_path
    return _user_db_path("demo")


def demo_db_exists() -> bool:
    """Check if demo data already exists."""
    from src.db_backend import is_postgres
    if is_postgres():
        return _demo_exists_pg()
    return _demo_exists_sqlite()


def _demo_exists_pg() -> bool:
    """Check if demo data exists in PostgreSQL for demo user.

    Checks garmin_daily which uses explicit user_id for the demo user.
    """
    from src.db_backend import get_pg_connection
    try:
        with get_pg_connection() as conn:
            cur = conn._conn.cursor()
            cur.execute(
                "SELECT COUNT(*) FROM garmin_daily WHERE user_id = "
                "(SELECT id FROM users WHERE email = 'demo@pd-app.local')"
            )
            count = cur.fetchone()[0]
            return count > 0
    except Exception:
        return False


def _demo_exists_sqlite() -> bool:
    """Check if demo SQLite database has data."""
    p = get_demo_db_path()
    if not p.exists():
        return False
    try:
        conn = sqlite3.connect(str(p))
        count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        conn.close()
        return count > 0
    except Exception:
        return False


def generate_demo_data():
    """Generate demo data. Called once, then persisted."""
    from src.demo_data import generate_demo_data as _gen
    _gen()


def add_daily_demo_data():
    """Add today's simulated data (no-op if data already exists for today)."""
    from src.demo_data import add_daily_demo_data as _add
    _add()
