"""Core database infrastructure: connections, init, migrations, schema SQL, utilities."""
import sqlite3
import pandas as pd
from pathlib import Path
from datetime import date, timedelta
import contextvars as _contextvars

import os as _os

from src.db_backend import is_postgres, DB_BACKEND


def _get_table_columns(conn, table: str) -> list[str]:
    """Get column names for a table (works with both SQLite and PostgreSQL)."""
    if is_postgres():
        from src.db_backend import pg_table_info
        return [r[1] for r in pg_table_info(conn, table)]
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]

# Legacy single-DB path (used only for migration)
DB_PATH = Path(__file__).parent.parent.parent / "data" / "pd.db"
CSV_PATH = Path(__file__).parent.parent.parent / "finances_clean.csv"

# ─── Per-user DB routing ──────────────────────────────────────────────────────

SHARED_DB_PATH = Path(__file__).parent.parent.parent / "data" / "shared.db"

_current_user_email: _contextvars.ContextVar[str | None] = _contextvars.ContextVar(
    "_db_current_user_email", default=None
)


def set_current_user(email: str):
    """Set current user email for DB routing (context-aware: works in threads and async)."""
    _current_user_email.set(email)


def get_current_user_email() -> str | None:
    """Get current user email for DB routing.

    Falls back to Streamlit user/session if ContextVar is not set
    (happens during @st.fragment reruns where the main script doesn't run).
    """
    email = _current_user_email.get(None)
    if email:
        return email
    try:
        import streamlit as st
        # Try st.user (Streamlit auth) — available in fragments
        if hasattr(st, "user") and st.user.is_logged_in:
            email = st.user.email
            if email:
                _current_user_email.set(email)
                return email
        # Try demo mode
        if st.session_state.get("demo_mode"):
            _current_user_email.set("demo@pd-app.local")
            return "demo@pd-app.local"
    except Exception:
        pass
    return None


def _user_db_dir(email: str) -> Path:
    """Return directory for a user's personal database."""
    safe = email.replace("@", "_at_").replace(".", "_")
    return Path(__file__).parent.parent.parent / "data" / "users" / safe


def _user_db_path(email: str) -> Path:
    """Return full path to a user's personal database."""
    d = _user_db_dir(email)
    d.mkdir(parents=True, exist_ok=True)
    return d / "pd.db"

# ─── Category tree ─────────────────────────────────────────────────────────────
# Format: (parent, [subcategories])  — stored in DB as "Parent" or "Parent / Child"
CATEGORY_TREE: list[tuple[str, list[str]]] = [
    ("Bus", []),
    ("Investments втрати", []),
    ("Shopping (не обов'язкове)", ["Одяг"]),
    ("Будинок в Києві", ["Ландшафт", "Мебель", "Пеллети", "Садовник", "Уборка", "Електричество"]),
    ("Відпочинок", ["lunar", "авіа, поїзд та інший транспорт", "дизель для буса", "проживання, отелі", "ресторан та смаколики"]),
    ("Даша", ["садочок"]),
    ("Доброчинність", []),
    ("Квартира Cordoba", []),
    ("Комуналка", ["Щербаківського"]),
    ("Мама О", []),
    ("Маша", ["школа"]),
    ("Медицина", ["Аптека", "Доктор", "Психолог"]),
    ("На себе", []),
    ("Навчання", []),
    ("Подарунки", []),
    ("Таня на витрати", ["белкомобіль"]),
    ("Спорт", ["Зал", "Спорядження"]),
    ("Підписки", ["Стрімінг", "Софт"]),
    ("Транспорт", []),
    ("Харчування і необхідне", ["online замовлення", "витрати Тані за картою", "Ринок", "Супермаркет"]),
    ("хз виділені категорії", []),
]

# Old DB category values → new normalized form
CATEGORY_MIGRATION: dict[str, str] = {
    "Відпочинок\\ресторан та смаколики":            "Відпочинок / ресторан та смаколики",
    "Харчування і необхідне\\Супермаркет":          "Харчування і необхідне / Супермаркет",
    "Їжа":                                          "Харчування і необхідне",
    "Їжа / Супермаркет":                            "Харчування і необхідне / Супермаркет",
    "Їжа / Ринок":                                  "Харчування і необхідне / Ринок",
    "Shopping (не обовʼязкове)":                    "Shopping (не обов'язкове)",
    "Харчування і необхідне\\Ринок, маленькі магазинчики": "Харчування і необхідне / Ринок",
    "Інше":                                         "хз виділені категорії",
    "Відпочинок\\авіа, поїзд та інший транспорт":   "Відпочинок / авіа, поїзд та інший транспорт",
    "Відпочинок\\дизель для буса":                  "Відпочинок / дизель для буса",
    "Відпочинок\\проживання, отелі":                "Відпочинок / проживання, отелі",
    "Відпочинок\\lunar":                            "Відпочинок / lunar",
    "Шопінг":                                       "Shopping (не обов'язкове)",
    "Будинок":                                      "Будинок в Києві",
    "Shopping (не обовʼязкове)\\Одяг":              "Shopping (не обов'язкове) / Одяг",
    "Доброчинність\\на війну":                      "Доброчинність",
    "Доброчинність / на війну":                     "Доброчинність",
    "Будинок в Києві\\Уборка":                      "Будинок в Києві / Уборка",
    "Будинок / Ландшафт":                           "Будинок в Києві / Ландшафт",
    "Будинок в Києві\\Ландшафт":                    "Будинок в Києві / Ландшафт",
    "Будинок в Києві\\Мебель":                      "Будинок в Києві / Мебель",
    "Будинок в Києві\\Садовник":                    "Будинок в Києві / Садовник",
    "Будинок в Києві\\Пеллеты":                     "Будинок в Києві / Пеллети",
    "Будинок в Києві\\Электричество":               "Будинок в Києві / Електричество",
    "Будинок / Електрика":                          "Будинок в Києві / Електричество",
    "Медицина\\Аптека":                             "Медицина / Аптека",
    "Медицина\\Доктор":                             "Медицина / Доктор",
    "Транспорт / Авто":                             "Bus",
    "Bus | Обслуговування":                         "Bus",
    "Bus | Купівля авто":                           "Bus",
    "Комуналка\\Щербаківського":                    "Комуналка / Щербаківського",
    "Маша\\школа":                                  "Маша / школа",
    "Харчування і необхідне\\online замовлення":    "Харчування і необхідне / online замовлення",
    "Харчування і необхідне\\витрати Тані за картою": "Харчування і необхідне / витрати Тані за картою",
    "Харчування і необхідне":                       "Харчування і необхідне",
    "Даша\\садочок":                                "Даша / садочок",
    "хз видаленні категорії":                       "хз виділені категорії",
    "Категория удалена":                            "хз виділені категорії",
    "Таня на витрати\\белкомобіль":                 "Таня на витрати / белкомобіль",
}


def _is_owner_user() -> bool:
    """Check if current user is the owner via DB role. Returns True for owner or unknown."""
    email = get_current_user_email()
    if not email:
        return True  # Default to owner for backwards compat
    try:
        with get_shared_conn() as conn:
            row = conn.execute(
                "SELECT role FROM users WHERE email = ?", (email,)
            ).fetchone()
            if row:
                return row[0] == "owner"
    except Exception:
        pass
    # No row found in users table — not an owner
    return False


def _get_all_categories_flat_impl() -> list[str]:
    """Uncached implementation of get_all_categories_flat."""
    if _is_owner_user():
        result = []
        for parent, children in CATEGORY_TREE:
            result.append(parent)
            for child in children:
                result.append(f"{parent} / {child}")
        return result
    else:
        from .settings import get_custom_categories
        return list(get_custom_categories())


try:
    import streamlit as _st

    @_st.cache_data(ttl=300)
    def get_all_categories_flat(user_key: str = "") -> list[str]:
        """Ordered flat list of categories (cached 5 min).

        Owner (Taras): returns hardcoded CATEGORY_TREE.
        Other users (demo, new): returns custom_categories from DB.

        Args:
            user_key: cache-busting key (pass user email so each user gets own cache).
                      Must NOT start with '_' — streamlit excludes _-prefixed params from cache keys.
        """
        return _get_all_categories_flat_impl()
except Exception:
    def get_all_categories_flat(user_key: str = "") -> list[str]:  # type: ignore[misc]
        """Ordered flat list of categories (no cache fallback)."""
        return _get_all_categories_flat_impl()


CREATE_FAVOURITES_SQL = """
CREATE TABLE IF NOT EXISTS category_favourites (
    category TEXT PRIMARY KEY
)"""

CREATE_CUSTOM_CATEGORIES_SQL = """
CREATE TABLE IF NOT EXISTS custom_categories (
    category TEXT PRIMARY KEY
)"""

CREATE_SECRETS_SQL = """
CREATE TABLE IF NOT EXISTS secrets (
    key   TEXT PRIMARY KEY,
    value TEXT
)"""

CREATE_CUSTOM_ACCOUNTS_SQL = """
CREATE TABLE IF NOT EXISTS custom_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    currency TEXT NOT NULL DEFAULT '€',
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    initial_balance REAL NOT NULL DEFAULT 0
)"""

CREATE_USERS_SQL = """
CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""

# ─── Garmin tables ───────────────────────────────────────────────────────────

CREATE_GARMIN_DAILY_SQL = """
CREATE TABLE IF NOT EXISTS garmin_daily (
    date TEXT PRIMARY KEY,
    steps INTEGER,
    calories_total INTEGER,
    calories_active INTEGER,
    distance_m REAL,
    floors_up INTEGER,
    floors_down INTEGER,
    intensity_minutes INTEGER,
    resting_hr INTEGER,
    avg_hr INTEGER,
    max_hr INTEGER,
    avg_stress INTEGER,
    max_stress INTEGER,
    body_battery_high INTEGER,
    body_battery_low INTEGER,
    sleep_seconds INTEGER,
    sleep_score INTEGER,
    spo2_avg REAL,
    respiration_avg REAL,
    synced_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""

CREATE_GARMIN_ACTIVITIES_SQL = """
CREATE TABLE IF NOT EXISTS garmin_activities (
    activity_id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    activity_type TEXT,
    activity_name TEXT,
    duration_seconds REAL,
    distance_m REAL,
    calories INTEGER,
    avg_hr INTEGER,
    max_hr INTEGER,
    avg_speed REAL,
    elevation_gain REAL,
    training_effect_aerobic REAL,
    training_effect_anaerobic REAL,
    synced_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""

CREATE_GARMIN_SLEEP_SQL = """
CREATE TABLE IF NOT EXISTS garmin_sleep (
    date TEXT PRIMARY KEY,
    sleep_start TEXT,
    sleep_end TEXT,
    duration_seconds INTEGER,
    deep_seconds INTEGER,
    light_seconds INTEGER,
    rem_seconds INTEGER,
    awake_seconds INTEGER,
    sleep_score INTEGER,
    synced_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""

CREATE_GARMIN_HR_SQL = """
CREATE TABLE IF NOT EXISTS garmin_heart_rate (
    date TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    heart_rate INTEGER,
    PRIMARY KEY (date, timestamp)
)"""

# ─── Garmin staging + body composition ────────────────────────────────────────

CREATE_GARMIN_STAGING_SQL = """
CREATE TABLE IF NOT EXISTS garmin_staging (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL,
    date TEXT,
    raw_json TEXT NOT NULL,
    fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""

CREATE_GARMIN_BODY_COMP_SQL = """
CREATE TABLE IF NOT EXISTS garmin_body_composition (
    date TEXT PRIMARY KEY,
    weight REAL,
    bmi REAL,
    body_fat_pct REAL,
    muscle_mass REAL,
    bone_mass REAL,
    body_water_pct REAL,
    physique_rating INTEGER,
    metabolic_age INTEGER,
    visceral_fat INTEGER,
    synced_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""

# ─── Withings tables ─────────────────────────────────────────────────────────

CREATE_WITHINGS_MEASUREMENTS_SQL = """
CREATE TABLE IF NOT EXISTS withings_measurements (
    date TEXT PRIMARY KEY,
    weight REAL,
    fat_ratio REAL,
    fat_mass REAL,
    fat_free_mass REAL,
    heart_rate INTEGER,
    bmi REAL,
    synced_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""

CREATE_GUEST_INVITES_SQL = """
CREATE TABLE IF NOT EXISTS guest_invites (
    email TEXT PRIMARY KEY,
    invited_by TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""

# ─── Food tracking ────────────────────────────────────────────────────────────

CREATE_FOOD_LOG_SQL = """
CREATE TABLE IF NOT EXISTS food_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    date TEXT NOT NULL,
    time TEXT,
    description TEXT,
    weight_g REAL,
    calories REAL,
    protein_g REAL,
    fat_g REAL,
    carbs_g REAL,
    source TEXT DEFAULT 'text',
    photo_file_id TEXT,
    ai_raw_response TEXT,
    confirmed INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""

CREATE_AI_NOTES_SQL = """
CREATE TABLE IF NOT EXISTS ai_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL UNIQUE,
    note TEXT NOT NULL,
    prompt TEXT DEFAULT '',
    generated_at TEXT NOT NULL
)"""

CREATE_AI_CONTEXT_SNAPSHOTS_SQL = """
CREATE TABLE IF NOT EXISTS ai_context_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_type TEXT NOT NULL,
    period_key TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'all',
    content TEXT NOT NULL,
    generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(period_type, period_key, domain)
)"""

CREATE_SHOPPING_ITEMS_SQL = """
CREATE TABLE IF NOT EXISTS shopping_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    quantity TEXT DEFAULT '1',
    added_by TEXT DEFAULT 'app',
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    bought_at TEXT,
    bought_by TEXT
)"""

CREATE_SHOPPING_HISTORY_SQL = """
CREATE TABLE IF NOT EXISTS shopping_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    quantity TEXT DEFAULT '1',
    bought_date TEXT NOT NULL,
    bought_by TEXT DEFAULT 'app'
)"""

CREATE_TRANSACTIONS_SQL = """
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    year INTEGER,
    month INTEGER,
    type TEXT,
    sub_type TEXT,
    account TEXT,
    category TEXT,
    amount_original REAL,
    currency_original TEXT,
    amount_eur REAL,
    nbu_rate_eur_used REAL,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_DAILY_LOG_SQL = """
CREATE TABLE IF NOT EXISTS daily_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    level REAL,
    mood_delta INTEGER,
    sex_count INTEGER,
    sex_note TEXT,
    bj_count INTEGER,
    bj_note TEXT,
    kids_hours REAL,
    kids_note TEXT,
    general_note TEXT,
    energy_level INTEGER,
    stress_level INTEGER,
    focus_quality INTEGER,
    alcohol INTEGER,
    caffeine INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
"""

CATEGORY_ALIASES = {
    "Харчування і необхідне": "Їжа",
    "Харчування і необхідне\\Супермаркет": "Їжа / Супермаркет",
    "Харчування і необхідне\\Ринок, маленькі магазинчики": "Їжа / Ринок",
    "Bus | Обслуговування": "Транспорт / Авто",
    "Bus": "Транспорт / Авто",
    "Shopping (не обовʼязкове)": "Шопінг",
    "Будинок в Києві": "Будинок",
    "Будинок в Києві\\Электричество": "Будинок / Електрика",
    "Будинок в Києві\\Ландшафт": "Будинок / Ландшафт",
    "хз видаленні категорії": "Інше",
}


import threading as _threading
_local = _threading.local()


# ─── SQLite connection pool ──────────────────────────────────────────────────
class _SqlitePool:
    """Simple thread-safe connection pool for SQLite databases.

    Caches open connections by db_path so that switching between users/DBs
    on the same thread doesn't needlessly close and reopen connections.
    Max *max_per_db* connections are kept per database path.
    """

    def __init__(self, *, max_per_db: int = 8):
        self._lock = _threading.Lock()
        # {db_path_str: [conn, ...]}  – available (idle) connections
        self._idle: dict[str, list] = {}
        # {id(conn): db_path_str}  – all connections handed out
        self._checked_out: dict[int, str] = {}
        self._max_per_db = max_per_db

    # ── public API ──────────────────────────────────────────────────────

    def get(self, db_path: str) -> "sqlite3.Connection":
        """Return a cached connection for *db_path*, or open a new one."""
        with self._lock:
            idle = self._idle.get(db_path, [])
            while idle:
                conn = idle.pop()
                if _is_conn_alive(conn):
                    self._checked_out[id(conn)] = db_path
                    return conn
                # stale – discard silently
                try:
                    conn.close()
                except Exception:
                    pass

        # No idle connection available – open a new one (outside the lock)
        conn = _open_db(Path(db_path))
        with self._lock:
            self._checked_out[id(conn)] = db_path
        return conn

    def put(self, conn) -> None:
        """Return a connection to the pool (or close it if pool is full)."""
        with self._lock:
            db_path = self._checked_out.pop(id(conn), None)
            if db_path is None:
                # Unknown connection – just close
                try:
                    conn.close()
                except Exception:
                    pass
                return
            idle = self._idle.setdefault(db_path, [])
            if len(idle) < self._max_per_db and _is_conn_alive(conn):
                idle.append(conn)
            else:
                try:
                    conn.close()
                except Exception:
                    pass

    def close_all(self) -> None:
        """Close every connection (idle + checked out are forgotten)."""
        with self._lock:
            for conns in self._idle.values():
                for c in conns:
                    try:
                        c.close()
                    except Exception:
                        pass
            self._idle.clear()
            self._checked_out.clear()


_sqlite_pool = _SqlitePool()


# Track DB paths that have passed integrity check (skip on reconnect)
_integrity_checked: set[str] = set()

def _resolve_db_path() -> Path:
    """Return the effective DB path, routing to per-user DB based on current user."""
    try:
        import streamlit as st
        if st.session_state.get("demo_mode"):
            return _user_db_path("demo")
    except Exception:
        pass
    email = _current_user_email.get(None)
    if email:
        return _user_db_path(email)
    # Legacy fallback — old single pd.db
    return DB_PATH


def _check_db_integrity(conn: sqlite3.Connection) -> bool:
    """Run PRAGMA integrity_check and return True if DB is healthy."""
    try:
        result = conn.execute("PRAGMA integrity_check").fetchone()
        return result is not None and result[0] == "ok"
    except Exception:
        return False


def _try_recover_db(db_path: Path) -> bool:
    """Attempt to recover a corrupted DB using .recover command.

    Creates a new DB from recoverable data, replaces the corrupted file.
    Returns True if recovery succeeded.
    """
    import subprocess, shutil, logging
    _log = logging.getLogger(__name__)
    _log.warning("Attempting to recover corrupted DB: %s", db_path)

    recovered_path = db_path.with_suffix(".recovered.db")
    try:
        # sqlite3 .recover dumps recoverable SQL
        result = subprocess.run(
            ["sqlite3", str(db_path), ".recover"],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0 or not result.stdout.strip():
            _log.error("Recovery dump failed: %s", result.stderr)
            return False

        # Import recovered SQL into a new DB
        new_conn = sqlite3.connect(recovered_path)
        new_conn.executescript(result.stdout)
        new_conn.close()

        # Verify the recovered DB
        verify_conn = sqlite3.connect(recovered_path)
        if not _check_db_integrity(verify_conn):
            verify_conn.close()
            recovered_path.unlink(missing_ok=True)
            _log.error("Recovered DB also failed integrity check")
            return False
        verify_conn.close()

        # Replace corrupted with recovered
        backup_path = db_path.with_suffix(".corrupted.bak")
        shutil.move(str(db_path), str(backup_path))
        shutil.move(str(recovered_path), str(db_path))
        _log.info("DB recovered successfully. Corrupted backup at: %s", backup_path)
        return True
    except Exception as e:
        _log.error("Recovery failed: %s", e)
        recovered_path.unlink(missing_ok=True)
        return False


def _open_db(db_path: Path) -> sqlite3.Connection:
    """Open a SQLite connection with retries, integrity check, and auto-recovery."""
    import time as _time
    import logging
    _log = logging.getLogger(__name__)

    conn = None
    for _attempt in range(10):
        try:
            db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(db_path, check_same_thread=False)
            conn.execute("SELECT 1")
            break
        except sqlite3.OperationalError:
            if _attempt < 9:
                _time.sleep(3)
            else:
                raise
        except sqlite3.DatabaseError as e:
            # Corrupted DB — attempt recovery
            _log.error("DatabaseError opening %s: %s", db_path, e)
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
            if _try_recover_db(db_path):
                conn = sqlite3.connect(db_path, check_same_thread=False)
                conn.execute("SELECT 1")
                break
            else:
                # Recovery failed — rename corrupted and start fresh
                _log.warning("Recovery failed, creating fresh DB: %s", db_path)
                corrupted = db_path.with_suffix(".corrupted.bak")
                try:
                    db_path.rename(corrupted)
                except Exception:
                    db_path.unlink(missing_ok=True)
                conn = sqlite3.connect(db_path, check_same_thread=False)
                conn.execute("SELECT 1")
                break

    # Integrity check — only on first open per DB path (expensive for large DBs)
    _db_key = str(db_path)
    if _db_key not in _integrity_checked:
        try:
            quick = conn.execute("PRAGMA quick_check").fetchone()
            if quick is None or quick[0] != "ok":
                _log.warning("quick_check failed for %s, attempting recovery", db_path)
                conn.close()
                if _try_recover_db(db_path):
                    conn = sqlite3.connect(db_path, check_same_thread=False)
                else:
                    corrupted = db_path.with_suffix(".corrupted.bak")
                    try:
                        db_path.rename(corrupted)
                    except Exception:
                        db_path.unlink(missing_ok=True)
                    conn = sqlite3.connect(db_path, check_same_thread=False)
        except sqlite3.DatabaseError:
            _log.warning("Integrity check raised DatabaseError for %s", db_path)
            conn.close()
            if _try_recover_db(db_path):
                conn = sqlite3.connect(db_path, check_same_thread=False)
            else:
                corrupted = db_path.with_suffix(".corrupted.bak")
                try:
                    db_path.rename(corrupted)
                except Exception:
                    db_path.unlink(missing_ok=True)
                conn = sqlite3.connect(db_path, check_same_thread=False)
        _integrity_checked.add(_db_key)

    # Performance PRAGMAs
    for _pragma in ["PRAGMA journal_mode=WAL", "PRAGMA busy_timeout=5000",
                     "PRAGMA synchronous=NORMAL", "PRAGMA cache_size=-20000",
                     "PRAGMA temp_store=MEMORY", "PRAGMA foreign_keys=ON"]:
        try:
            conn.execute(_pragma)
        except (sqlite3.OperationalError, sqlite3.DatabaseError):
            pass
    try:
        conn.execute("PRAGMA mmap_size=268435456")
    except (sqlite3.OperationalError, sqlite3.DatabaseError):
        pass
    return conn


def _is_conn_alive(conn) -> bool:
    """Check if a cached SQLite connection is still usable."""
    try:
        conn.execute("SELECT 1")
        return True
    except Exception:
        return False


def get_conn():
    """Return a per-user DB connection, cached per thread via the SQLite pool.

    For SQLite the connection is obtained from ``_sqlite_pool`` and pinned to
    the calling thread (via ``threading.local``) so that consecutive calls in
    the same thread return the same connection.  When the user/db_path changes
    the old connection is returned to the pool and a new one is obtained.

    For PostgreSQL, a fresh connection is taken from the PG pool (must be used
    as a context-manager).
    """
    if is_postgres():
        return _get_pg_conn()

    db_path = str(_resolve_db_path())
    conn = getattr(_local, "conn", None)
    prev_path = getattr(_local, "db_path", None)

    # Fast path – same thread, same db_path, connection alive
    if conn is not None and prev_path == db_path and _is_conn_alive(conn):
        return conn

    # Return the stale/wrong-db connection to the pool
    if conn is not None:
        _sqlite_pool.put(conn)

    conn = _sqlite_pool.get(db_path)
    _local.conn = conn
    _local.db_path = db_path
    return conn


def get_shared_conn():
    """Return a connection to the shared database (users, nbu_rates, guest_invites)."""
    if is_postgres():
        return _get_pg_conn()  # PostgreSQL uses single DB

    db_path = str(SHARED_DB_PATH)
    conn = getattr(_local, "shared_conn", None)
    prev_path = getattr(_local, "shared_db_path", None)

    if conn is not None and prev_path == db_path and _is_conn_alive(conn):
        return conn

    if conn is not None:
        _sqlite_pool.put(conn)

    conn = _sqlite_pool.get(db_path)
    _local.shared_conn = conn
    _local.shared_db_path = db_path
    return conn


def _get_pg_conn():
    """Get a fresh PostgreSQL connection from pool. Must use as context manager."""
    from src.db_backend import get_pg_connection
    return get_pg_connection()


_SLOW_QUERY_MS = 100  # log queries slower than this


def read_sql(sql: str, conn, params=None) -> pd.DataFrame:
    """Execute SELECT and return DataFrame. Logs slow queries (>100ms)."""
    import time as _t
    _start = _t.monotonic()
    cur = conn.execute(sql, params or [])
    if cur.description is None:
        return pd.DataFrame()
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    _elapsed_ms = (_t.monotonic() - _start) * 1000
    if _elapsed_ms > _SLOW_QUERY_MS:
        import logging
        logging.getLogger(__name__).warning(
            "Slow query (%.0fms): %s", _elapsed_ms, sql[:200]
        )
    return pd.DataFrame(rows, columns=cols)


def get_db_schema() -> str:
    """Return a concise description of all DB tables and their columns."""
    with get_conn() as conn:
        if is_postgres():
            from src.db_backend import pg_table_info
            tables_rows = conn._conn.cursor()
            tables_rows.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' ORDER BY table_name"
            )
            tables = [(r[0],) for r in tables_rows.fetchall()]
            lines = []
            for (tbl,) in tables:
                cols = pg_table_info(conn, tbl)
                cur = conn._conn.cursor()
                cur.execute(f"SELECT COUNT(*) FROM {tbl}")
                cnt = cur.fetchone()[0]
                col_descs = [f"{c[1]} ({c[2]})" for c in cols]
                lines.append(f"{tbl} ({cnt} rows): {', '.join(col_descs)}")
        else:
            tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
            lines = []
            for (tbl,) in tables:
                cols = conn.execute(f"PRAGMA table_info({tbl})").fetchall()
                cnt = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
                col_descs = [f"{c[1]} ({c[2]})" for c in cols]
                lines.append(f"{tbl} ({cnt} rows): {', '.join(col_descs)}")
    return "\n".join(lines)


def execute_readonly_query(sql: str, limit: int = 200) -> str:
    """Execute a read-only SQL query and return results as text.

    Only SELECT statements are allowed. Results are truncated to `limit` rows.
    """
    sql_stripped = sql.strip().rstrip(";")
    if not sql_stripped.upper().startswith("SELECT"):
        return "ERROR: Only SELECT queries are allowed."

    # ── Harden against SQL injection ──
    # Strip comments
    import re
    normalized = re.sub(r"--[^\n]*", " ", sql_stripped)          # line comments
    normalized = re.sub(r"/\*.*?\*/", " ", normalized, flags=re.DOTALL)  # block comments
    normalized_upper = normalized.upper()

    # Reject dangerous keywords
    _BLOCKED = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER",
                "CREATE", "TRUNCATE", "EXEC", "GRANT", "REVOKE",
                "ATTACH", "DETACH", "PRAGMA", "LOAD_EXTENSION"]
    for kw in _BLOCKED:
        if re.search(rf"\b{kw}\b", normalized_upper):
            return f"ERROR: Forbidden keyword '{kw}' in query."

    # Reject dangerous multi-word patterns
    if re.search(r"\bWITH\s+RECURSIVE\b", normalized_upper):
        return "ERROR: Forbidden keyword 'WITH RECURSIVE' in query."

    # Reject semicolons (prevent multi-statement attacks)
    if ";" in normalized:
        return "ERROR: Multiple statements are not allowed."
    # Add LIMIT if not present
    if "LIMIT" not in sql_stripped.upper():
        sql_stripped += f" LIMIT {limit}"
    try:
        with get_conn() as conn:
            cur = conn.execute(sql_stripped)
            cols = [d[0] for d in cur.description] if cur.description else []
            rows = cur.fetchall()
        if not rows:
            return "No results."
        lines = [" | ".join(cols)]
        for row in rows:
            lines.append(" | ".join(str(v) for v in row))
        return "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


def _derive_owner(account: str) -> str:
    """Derive owner name from account name."""
    if account and "Tatiana" in account:
        return "Tatiana"
    return "Taras"


def _migrate_garmin_schema(conn):
    """Add new columns to existing Garmin tables (safe: skips if already present)."""
    def _add_cols(table: str, new_cols: dict[str, str]):
        if is_postgres():
            from src.db_backend import pg_table_info
            existing = {r[1] for r in pg_table_info(conn, table)}
        else:
            existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for col, col_type in new_cols.items():
            if col not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")

    _add_cols("garmin_daily", {
        "hrv_weekly_avg": "INTEGER",
        "hrv_last_night": "INTEGER",
        "hrv_status": "TEXT",
        "training_readiness_score": "INTEGER",
        "training_status": "TEXT",
        "training_load": "REAL",
        "vo2max_running": "REAL",
        "vo2max_cycling": "REAL",
        "fitness_age": "INTEGER",
        "endurance_score": "INTEGER",
        "body_battery_charged": "INTEGER",
        "body_battery_drained": "INTEGER",
        "steps_goal": "INTEGER",
        "moderate_intensity_minutes": "INTEGER",
        "vigorous_intensity_minutes": "INTEGER",
        "lowest_spo2": "REAL",
    })

    _add_cols("garmin_activities", {
        "avg_running_cadence": "REAL",
        "max_running_cadence": "REAL",
        "avg_power": "REAL",
        "steps": "INTEGER",
        "sport_type": "TEXT",
        "event_type": "TEXT",
    })

    _add_cols("garmin_sleep", {
        "avg_respiration": "REAL",
        "avg_spo2": "REAL",
        "lowest_spo2": "REAL",
        "avg_hr": "INTEGER",
        "lowest_hr": "INTEGER",
        "highest_hr": "INTEGER",
        "hrv_sleep": "INTEGER",
        "body_battery_change": "INTEGER",
    })


_shared_db_initialized = False

def init_shared_db():
    """Initialize the shared database (users, guest_invites, nbu_rates)."""
    global _shared_db_initialized
    if _shared_db_initialized:
        return
    SHARED_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_shared_conn() as conn:
        conn.execute(CREATE_USERS_SQL)
        conn.execute(CREATE_GUEST_INVITES_SQL)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS nbu_rates (
                date          TEXT NOT NULL,
                currency_code TEXT NOT NULL,
                rate          REAL NOT NULL,
                PRIMARY KEY (date, currency_code)
            )
        """)
        # Telegram links: map telegram_id -> app user
        conn.execute("""
            CREATE TABLE IF NOT EXISTS telegram_links (
                telegram_id INTEGER PRIMARY KEY,
                user_email TEXT NOT NULL,
                telegram_username TEXT DEFAULT ''
            )
        """)
        # Telegram connect codes (temporary, for /connect flow)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS telegram_connect_codes (
                code TEXT PRIMARY KEY,
                user_email TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Audit log
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Pre-seed owner user
        conn.execute(
            "INSERT OR IGNORE INTO users (email, name, role) VALUES (?, ?, ?)",
            ("${OWNER_EMAIL:-admin@example.com}", "Taras", "owner"),
        )
        # Migrate existing hardcoded telegram links
        conn.execute(
            "INSERT OR IGNORE INTO telegram_links (telegram_id, user_email, telegram_username) "
            "VALUES (?, ?, ?)",
            (int(_os.environ.get("TELEGRAM_TARAS_ID", "0") or "0"), "${OWNER_EMAIL:-admin@example.com}", "tapacp"),
        )
        _tatiana_id = _os.environ.get("TELEGRAM_TATIANA_ID", "")
        if _tatiana_id:
            conn.execute(
                "INSERT OR IGNORE INTO telegram_links (telegram_id, user_email, telegram_username) "
                "VALUES (?, ?, ?)",
                (int(_tatiana_id), "tatiana@pd-app.local", "taba777"),
            )
    _shared_db_initialized = True


_user_db_initialized: set[str] = set()


def _pg_migrate_unique_constraints(conn):
    """Ensure all per-user PG tables have user_id column + composite UNIQUE constraints.

    On first deploy, tables were created from pg_schema.sql without user_id.
    _translate_sql handles CREATE TABLE IF NOT EXISTS, but that's a no-op for
    existing tables.  This migration adds the missing columns and constraints.

    Uses SAVEPOINTs so one table's failure doesn't rollback others.
    """
    import logging
    _log = logging.getLogger(__name__)

    _email = get_current_user_email()

    # (table, old_pkey_to_drop, composite_unique_cols)
    _MIGRATIONS = [
        ("secrets",                "secrets_pkey",                "user_id, key"),
        ("category_favourites",   "category_favourites_pkey",    "user_id, category"),
        ("custom_categories",     "custom_categories_pkey",      "user_id, category"),
        ("garmin_daily",          "garmin_daily_pkey",           "user_id, date"),
        ("garmin_activities",     "garmin_activities_pkey",      "user_id, activity_id"),
        ("garmin_sleep",          "garmin_sleep_pkey",           "user_id, date"),
        ("garmin_heart_rate",     "garmin_heart_rate_pkey",      'user_id, date, "timestamp"'),
        ("garmin_body_composition", "garmin_body_composition_pkey", "user_id, date"),
        ("withings_measurements", "withings_measurements_pkey",  "user_id, date"),
        ("ai_notes",       None, "user_id, section"),
        ("budgets",        None, "user_id, category, month"),
        ("daily_log",      None, "user_id, date"),
        ("custom_accounts", None, "user_id, name"),
        ("gym_exercises",  None, "user_id, name"),
        ("gym_programs",   None, "user_id, name"),
    ]

    # Tables that only need user_id column (no UNIQUE constraint change)
    _USER_ID_ONLY = [
        "gym_workouts", "gym_workout_exercises", "gym_sets",
        "gym_program_days", "gym_program_exercises",
    ]

    for _tbl, _old_pkey, _unique_cols in _MIGRATIONS:
        _sp = f"sp_{_tbl}"
        try:
            conn.execute(f"SAVEPOINT {_sp}")

            _cols = _get_table_columns(conn, _tbl)
            if not _cols:
                conn.execute(f"RELEASE SAVEPOINT {_sp}")
                continue
            if "user_id" not in _cols:
                conn.execute(f"ALTER TABLE {_tbl} ADD COLUMN user_id INTEGER")
                _log.info("Added user_id column to %s", _tbl)

            conn.execute(f"""
                UPDATE {_tbl} SET user_id = (
                    SELECT id FROM users WHERE email = %s LIMIT 1
                ) WHERE user_id IS NULL
            """, (_email,))

            if _old_pkey:
                conn.execute(f"ALTER TABLE {_tbl} DROP CONSTRAINT IF EXISTS {_old_pkey}")

            _existing = conn.execute("""
                SELECT conname FROM pg_constraint
                WHERE conrelid = %s::regclass AND contype = 'u'
            """, (_tbl,)).fetchall()
            _desired_name = f"{_tbl}_user_{'_'.join(c.strip().strip('\"') for c in _unique_cols.split(',') if c.strip() != 'user_id')}_uq"
            for (_cname,) in _existing:
                if _cname == _desired_name:
                    continue
                conn.execute(f"ALTER TABLE {_tbl} DROP CONSTRAINT IF EXISTS {_cname}")

            # Deduplicate before adding UNIQUE constraint
            _non_uid_cols = [c.strip() for c in _unique_cols.split(",") if c.strip() != "user_id"]
            _dedup_cols = ", ".join(_non_uid_cols)
            _has_id = "id" in _cols
            if _has_id:
                # Keep the row with the highest id for each unique combo
                conn.execute(f"""
                    DELETE FROM {_tbl} a USING {_tbl} b
                    WHERE a.user_id = b.user_id AND {' AND '.join(f'a.{c} = b.{c}' for c in _non_uid_cols)}
                    AND a.id < b.id
                """)
            else:
                # For tables without id, use ctid to deduplicate
                conn.execute(f"""
                    DELETE FROM {_tbl} WHERE ctid NOT IN (
                        SELECT MIN(ctid) FROM {_tbl} GROUP BY user_id, {_dedup_cols}
                    )
                """)

            conn.execute(f"""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conrelid = '{_tbl}'::regclass AND conname = '{_desired_name}'
                    ) THEN
                        ALTER TABLE {_tbl} ADD CONSTRAINT {_desired_name} UNIQUE ({_unique_cols});
                    END IF;
                END $$
            """)
            conn.execute(f"RELEASE SAVEPOINT {_sp}")
            _log.info("Migration OK for %s", _tbl)
        except Exception as e:
            _log.warning("Migration for %s failed: %s", _tbl, e)
            try:
                conn.execute(f"ROLLBACK TO SAVEPOINT {_sp}")
            except Exception:
                pass

    # Add user_id to gym workout tables (no UNIQUE constraint needed, just the column)
    for _tbl in _USER_ID_ONLY:
        _sp = f"sp_{_tbl}"
        try:
            conn.execute(f"SAVEPOINT {_sp}")
            _cols = _get_table_columns(conn, _tbl)
            if not _cols:
                conn.execute(f"RELEASE SAVEPOINT {_sp}")
                continue
            if "user_id" not in _cols:
                conn.execute(f"ALTER TABLE {_tbl} ADD COLUMN user_id INTEGER")
                _log.info("Added user_id column to %s", _tbl)
            conn.execute(f"""
                UPDATE {_tbl} SET user_id = (
                    SELECT id FROM users WHERE email = %s LIMIT 1
                ) WHERE user_id IS NULL
            """, (_email,))
            conn.execute(f"RELEASE SAVEPOINT {_sp}")
        except Exception as e:
            _log.warning("Migration for %s (user_id only) failed: %s", _tbl, e)
            try:
                conn.execute(f"ROLLBACK TO SAVEPOINT {_sp}")
            except Exception:
                pass


def init_db():
    """Initialize per-user personal database (must call set_current_user first)."""
    from .settings import CREATE_BUDGETS_SQL, CREATE_RECURRING_SQL, CREATE_SAVINGS_GOALS_SQL, \
        CREATE_BUDGET_CONFIG_SQL, CREATE_MANDATORY_CATEGORIES_SQL, CREATE_CHAT_HISTORY_SQL

    _email = get_current_user_email() or ""
    if _email in _user_db_initialized:
        return
    with get_conn() as conn:
        conn.execute(CREATE_TRANSACTIONS_SQL)
        conn.execute(CREATE_DAILY_LOG_SQL)
        conn.execute(CREATE_FAVOURITES_SQL)
        conn.execute(CREATE_CUSTOM_CATEGORIES_SQL)
        conn.execute(CREATE_SECRETS_SQL)
        conn.execute(CREATE_CUSTOM_ACCOUNTS_SQL)
        conn.execute(CREATE_GARMIN_DAILY_SQL)
        conn.execute(CREATE_GARMIN_ACTIVITIES_SQL)
        conn.execute(CREATE_GARMIN_SLEEP_SQL)
        conn.execute(CREATE_GARMIN_HR_SQL)
        conn.execute(CREATE_GARMIN_STAGING_SQL)
        conn.execute(CREATE_GARMIN_BODY_COMP_SQL)
        conn.execute(CREATE_WITHINGS_MEASUREMENTS_SQL)
        conn.execute(CREATE_FOOD_LOG_SQL)
        conn.execute(CREATE_SHOPPING_ITEMS_SQL)
        conn.execute(CREATE_SHOPPING_HISTORY_SQL)
        conn.execute(CREATE_AI_NOTES_SQL)
        conn.execute(CREATE_AI_CONTEXT_SNAPSHOTS_SQL)
        conn.execute(CREATE_BUDGETS_SQL)
        conn.execute(CREATE_RECURRING_SQL)
        conn.execute(CREATE_SAVINGS_GOALS_SQL)
        conn.execute(CREATE_CHAT_HISTORY_SQL)
        conn.execute(CREATE_GUEST_INVITES_SQL)
        conn.execute(CREATE_BUDGET_CONFIG_SQL)
        conn.execute(CREATE_MANDATORY_CATEGORIES_SQL)

        # ── Garmin schema migrations (add new columns) ──
        _migrate_garmin_schema(conn)

        # ── daily_log schema migration (add new lifestyle columns) ──
        _dl_cols = _get_table_columns(conn, "daily_log")
        for _col, _type in [("energy_level", "INTEGER"), ("stress_level", "INTEGER"),
                             ("focus_quality", "INTEGER"), ("alcohol", "INTEGER"),
                             ("caffeine", "INTEGER")]:
            if _col not in _dl_cols:
                conn.execute(f"ALTER TABLE daily_log ADD COLUMN {_col} {_type}")

        # Add owner column if it doesn't exist yet
        cols = _get_table_columns(conn, "transactions")
        if "owner" not in cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN owner TEXT DEFAULT 'Taras'")
            conn.execute("""
                UPDATE transactions
                SET owner = CASE
                    WHEN account LIKE '%Tatiana%' THEN 'Tatiana'
                    ELSE 'Taras'
                END
            """)

        # ── Performance indexes ──
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(type, date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_daily_log_date ON daily_log(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_food_log_date ON food_log(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_food_log_user_date ON food_log(user_id, date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_garmin_daily_date ON garmin_daily(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_shopping_items_bought ON shopping_items(bought_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chat_history_created ON chat_history(created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)")

        # ── Additional performance indexes (task #11) ──
        conn.execute("CREATE INDEX IF NOT EXISTS idx_custom_accounts_name ON custom_accounts(name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_recurring_tx_active_day ON recurring_transactions(active, day_of_month)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_budgets_cat_month ON budgets(category, month)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_transactions_year_month ON transactions(year, month)")

        # ── PostgreSQL-specific indexes (large shared tables benefit from these) ──
        if is_postgres():
            conn.execute("CREATE INDEX IF NOT EXISTS idx_garmin_activities_date ON garmin_activities(date)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_withings_date ON withings_measurements(date)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_daily_log_user_date ON daily_log(user_id, date)")

        # ── User preferences table ──
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_email TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT,
                PRIMARY KEY (user_email, key)
            )
        """)

        # ── Multi-user migrations: add user_email to personal data tables ──
        for _tbl in ["daily_log", "budgets", "recurring_transactions",
                      "savings_goals", "chat_history",
                      "category_favourites"]:
            _cols = _get_table_columns(conn, _tbl)
            if "user_email" not in _cols:
                conn.execute(
                    f"ALTER TABLE {_tbl} ADD COLUMN user_email TEXT"
                )

        # Migration: add external_id and source columns to transactions
        _tx_cols = _get_table_columns(conn, "transactions")
        if "external_id" not in _tx_cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN external_id TEXT")
            conn.execute("ALTER TABLE transactions ADD COLUMN source TEXT DEFAULT 'manual'")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_external_id ON transactions(external_id) WHERE external_id IS NOT NULL")

        # Migration: custom_accounts old schema (account TEXT PK) -> new schema
        _ca_cols = _get_table_columns(conn, "custom_accounts")
        if "account" in _ca_cols and "name" not in _ca_cols:
            _old_accounts = [r[0] for r in conn.execute("SELECT account FROM custom_accounts").fetchall()]
            conn.execute("DROP TABLE custom_accounts")
            conn.execute(CREATE_CUSTOM_ACCOUNTS_SQL)
            for _i, _acc in enumerate(_old_accounts):
                conn.execute(
                    "INSERT OR IGNORE INTO custom_accounts (name, currency, sort_order) VALUES (?, ?, ?)",
                    (_acc, "€", _i),
                )

        # Migration: add initial_balance column to custom_accounts if missing
        _ca_cols_bal = _get_table_columns(conn, "custom_accounts")
        if "initial_balance" not in _ca_cols_bal:
            conn.execute("ALTER TABLE custom_accounts ADD COLUMN initial_balance REAL NOT NULL DEFAULT 0")

        # Auto-populate custom_accounts from existing transaction accounts
        _acc_count = conn.execute("SELECT COUNT(*) FROM custom_accounts").fetchone()[0]
        _tx_count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]

        if _acc_count == 0 and _tx_count > 0:
            # User has transactions but no custom_accounts — populate from transactions
            _tx_accounts = conn.execute("""
                SELECT account, currency_original, COUNT(*) as cnt
                FROM transactions
                WHERE account IS NOT NULL AND account != ''
                GROUP BY account, currency_original
                ORDER BY account, cnt DESC
            """).fetchall()
            _acc_currencies: dict[str, str] = {}
            for _row_acc, _row_cur, _row_cnt in _tx_accounts:
                if _row_acc not in _acc_currencies:
                    _acc_currencies[_row_acc] = _row_cur
            for _i, (_aname, _acur) in enumerate(_acc_currencies.items()):
                conn.execute(
                    "INSERT OR IGNORE INTO custom_accounts (name, currency, sort_order) VALUES (?, ?, ?)",
                    (_aname, _acur or "€", _i),
                )
        elif _acc_count == 0 and _tx_count == 0:
            # Fresh DB with no transactions — seed generic defaults
            _defaults = [("Cash", "€"), ("Monobank Black", "€"), ("Monobank White", "€")]
            for _i, (_aname, _acur) in enumerate(_defaults):
                conn.execute(
                    "INSERT OR IGNORE INTO custom_accounts (name, currency, sort_order) VALUES (?, ?, ?)",
                    (_aname, _acur, _i),
                )
        elif _acc_count > 0 and _tx_count > 0:
            # Both exist — ensure any transaction accounts missing from custom_accounts are added
            _existing_acc_names = {r[0] for r in conn.execute("SELECT name FROM custom_accounts").fetchall()}
            _tx_accounts_all = conn.execute("""
                SELECT account, currency_original, COUNT(*) as cnt
                FROM transactions
                WHERE account IS NOT NULL AND account != ''
                GROUP BY account, currency_original
                ORDER BY account, cnt DESC
            """).fetchall()
            _max_order = conn.execute("SELECT COALESCE(MAX(sort_order), -1) FROM custom_accounts").fetchone()[0]
            _new_acc_currencies: dict[str, str] = {}
            for _row_acc, _row_cur, _row_cnt in _tx_accounts_all:
                if _row_acc not in _existing_acc_names and _row_acc not in _new_acc_currencies:
                    _new_acc_currencies[_row_acc] = _row_cur
            for _aname, _acur in _new_acc_currencies.items():
                _max_order += 1
                conn.execute(
                    "INSERT OR IGNORE INTO custom_accounts (name, currency, sort_order) VALUES (?, ?, ?)",
                    (_aname, _acur or "€", _max_order),
                )

        # Apply category renames/migrations
        for _old_cat, _new_cat in CATEGORY_MIGRATION.items():
            for _cat_tbl, _cat_col in [
                ("transactions", "category"),
                ("budgets", "category"),
                ("recurring_transactions", "category"),
                ("custom_categories", "category"),
                ("category_favourites", "category"),
            ]:
                conn.execute(
                    f"UPDATE {_cat_tbl} SET {_cat_col}=? WHERE {_cat_col}=?",
                    (_new_cat, _old_cat),
                )

        # Seed default categories for new users (not existing users with data)
        _cat_count = conn.execute("SELECT COUNT(*) FROM custom_categories").fetchone()[0]
        _tx_count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        if _cat_count == 0 and _tx_count == 0:
            from src.demo_data import DEFAULT_CATEGORIES
            for _cat in DEFAULT_CATEGORIES:
                conn.execute(
                    "INSERT OR IGNORE INTO custom_categories (category) VALUES (?)",
                    (_cat,),
                )

        count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        if count == 0 and CSV_PATH.exists():
            _import_csv(conn)

        # Migration: ensure all per-user tables have user_id + composite UNIQUE constraints
        if is_postgres():
            _pg_migrate_unique_constraints(conn)

        # Migration: add CHECK constraints (PostgreSQL only)
        if is_postgres():
            _check_constraints = [
                ("transactions", "chk_amount", "amount_eur > 0"),
                ("transactions", "chk_currency", "currency_original IN ('€', '₴', '$')"),
            ]
            for _tbl, _cname, _cexpr in _check_constraints:
                try:
                    conn.execute(f"""
                        DO $$ BEGIN
                            ALTER TABLE {_tbl} ADD CONSTRAINT {_cname} CHECK ({_cexpr});
                        EXCEPTION WHEN duplicate_object THEN NULL;
                        END $$;
                    """)
                except Exception:
                    pass

        # Optimize query planner after migrations
        try:
            conn.execute("PRAGMA optimize")
        except Exception:
            pass

    _user_db_initialized.add(_email)


_legacy_migration_done = False


def migrate_legacy_db():
    """Migrate old single pd.db to shared.db + per-user DB (column-mapped)."""
    global _legacy_migration_done
    if _legacy_migration_done:
        return
    _legacy_migration_done = True

    if not DB_PATH.exists():
        return

    import logging
    _log = logging.getLogger(__name__)

    from .settings import CREATE_BUDGETS_SQL, CREATE_RECURRING_SQL, CREATE_SAVINGS_GOALS_SQL, \
        CREATE_CHAT_HISTORY_SQL, CREATE_BUDGET_CONFIG_SQL, CREATE_MANDATORY_CATEGORIES_SQL

    owner_email = "${OWNER_EMAIL:-admin@example.com}"
    owner_path = _user_db_path(owner_email)

    # Check if already migrated: shared has data AND user DB has transactions
    _needs_shared = True
    _needs_user = True
    if SHARED_DB_PATH.exists():
        try:
            _sc = sqlite3.connect(SHARED_DB_PATH, check_same_thread=False)
            cnt = _sc.execute("SELECT count(*) FROM nbu_rates").fetchone()[0]
            _sc.close()
            if cnt > 1000:
                _needs_shared = False
        except Exception:
            pass
    if owner_path.exists():
        try:
            _uc = sqlite3.connect(owner_path, check_same_thread=False)
            cnt = _uc.execute("SELECT count(*) FROM transactions").fetchone()[0]
            _uc.close()
            if cnt > 0:
                _needs_user = False
        except Exception:
            pass

    if not _needs_shared and not _needs_user:
        return  # already migrated

    _legacy = sqlite3.connect(DB_PATH, check_same_thread=False)
    if not _check_db_integrity(_legacy):
        _log.warning("Legacy DB failed integrity check, attempting recovery")
        _legacy.close()
        if _try_recover_db(DB_PATH):
            _legacy = sqlite3.connect(DB_PATH, check_same_thread=False)
        else:
            _log.error("Cannot recover legacy DB, skipping migration")
            return

    # Helper: get column names for a table
    def _cols(conn, tbl):
        return [r[1] for r in conn.execute(f"PRAGMA table_info({tbl})").fetchall()]

    def _table_exists(conn, tbl):
        return conn.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", (tbl,)
        ).fetchone()[0] > 0

    # ── 1. Copy shared data ──
    if _needs_shared:
        SHARED_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _shared = sqlite3.connect(SHARED_DB_PATH, check_same_thread=False)
        _shared.execute(CREATE_USERS_SQL)
        _shared.execute(CREATE_GUEST_INVITES_SQL)
        _shared.execute("""
            CREATE TABLE IF NOT EXISTS nbu_rates (
                date TEXT NOT NULL, currency_code TEXT NOT NULL, rate REAL NOT NULL,
                PRIMARY KEY (date, currency_code))
        """)
        for tbl, sql in [
            ("users", "INSERT OR IGNORE INTO users (email,name,role,created_at) VALUES (?,?,?,?)"),
            ("guest_invites", "INSERT OR IGNORE INTO guest_invites (email,invited_by,created_at) VALUES (?,?,?)"),
            ("nbu_rates", "INSERT OR REPLACE INTO nbu_rates (date,currency_code,rate) VALUES (?,?,?)"),
        ]:
            try:
                sel_cols = sql.split("(")[1].split(")")[0]
                for row in _legacy.execute(f"SELECT {sel_cols} FROM {tbl}").fetchall():
                    _shared.execute(sql, row)
            except Exception:
                pass
        _shared.commit()
        _shared.close()
        _log.info("Shared data migrated from legacy DB")

    # ── 2. Column-mapped migration of personal data ──
    if _needs_user:
        owner_path.parent.mkdir(parents=True, exist_ok=True)
        _user = sqlite3.connect(owner_path, check_same_thread=False)
        _user.execute("PRAGMA journal_mode=WAL")

        # Column mapping: (target_table, src_select, dst_insert)
        # For tables where schemas differ, we map columns explicitly
        _PERSONAL_TABLES_SIMPLE = [
            "garmin_daily", "garmin_sleep", "garmin_activities",
            "garmin_heart_rate", "garmin_body_composition", "garmin_staging",
            "withings_measurements", "shopping_items", "chat_history",
            "secrets", "budgets", "savings_goals",
            "recurring_transactions", "custom_categories",
        ]

        # First ensure all tables exist in user DB (init_db equivalent)
        for sql_const in [
            CREATE_TRANSACTIONS_SQL, CREATE_DAILY_LOG_SQL, CREATE_FAVOURITES_SQL,
            CREATE_CUSTOM_CATEGORIES_SQL, CREATE_SECRETS_SQL, CREATE_CUSTOM_ACCOUNTS_SQL,
            CREATE_GARMIN_DAILY_SQL, CREATE_GARMIN_ACTIVITIES_SQL, CREATE_GARMIN_SLEEP_SQL,
            CREATE_GARMIN_HR_SQL, CREATE_GARMIN_STAGING_SQL, CREATE_GARMIN_BODY_COMP_SQL,
            CREATE_WITHINGS_MEASUREMENTS_SQL, CREATE_FOOD_LOG_SQL,
            CREATE_SHOPPING_ITEMS_SQL, CREATE_SHOPPING_HISTORY_SQL,
            CREATE_AI_NOTES_SQL, CREATE_AI_CONTEXT_SNAPSHOTS_SQL,
            CREATE_BUDGETS_SQL, CREATE_RECURRING_SQL, CREATE_SAVINGS_GOALS_SQL,
            CREATE_CHAT_HISTORY_SQL,
            CREATE_BUDGET_CONFIG_SQL, CREATE_MANDATORY_CATEGORIES_SQL,
        ]:
            _user.execute(sql_const)

        # Gym tables
        from src.gym import _GYM_TABLES
        for sql in _GYM_TABLES:
            _user.execute(sql)
        _user.commit()

        # Attach legacy
        _user.execute(f"ATTACH DATABASE '{DB_PATH}' AS bak")

        # Simple tables: find common columns, copy
        for tbl in _PERSONAL_TABLES_SIMPLE:
            try:
                if not _table_exists(_legacy, tbl):
                    continue
                bak_c = _cols(_legacy, tbl)
                usr_c = _cols(_user, tbl)
                common = [c for c in bak_c if c in usr_c]
                if not common:
                    continue
                cnt = _user.execute(f"SELECT count(*) FROM bak.{tbl}").fetchone()[0]
                if cnt == 0:
                    continue
                cols_str = ", ".join(common)
                _user.execute(f"INSERT OR IGNORE INTO main.{tbl} ({cols_str}) SELECT {cols_str} FROM bak.{tbl}")
                _log.info(f"Migrated {tbl}: {cnt} rows")
            except Exception as e:
                _log.warning(f"Skip {tbl}: {e}")

        # transactions — extra columns external_id, source get NULLs
        try:
            _user.execute("""
                INSERT OR IGNORE INTO main.transactions
                (id,date,year,month,type,sub_type,account,category,
                 amount_original,currency_original,amount_eur,nbu_rate_eur_used,
                 description,created_at,owner)
                SELECT id,date,year,month,type,sub_type,account,category,
                       amount_original,currency_original,amount_eur,nbu_rate_eur_used,
                       description,created_at,owner
                FROM bak.transactions
            """)
            _log.info("Migrated transactions")
        except Exception as e:
            _log.warning(f"Skip transactions: {e}")

        # daily_log — column order differs
        try:
            _user.execute("""
                INSERT OR IGNORE INTO main.daily_log
                (id,date,level,mood_delta,sex_count,sex_note,bj_count,bj_note,
                 kids_hours,kids_note,general_note,energy_level,stress_level,
                 focus_quality,alcohol,caffeine,created_at)
                SELECT id,date,level,mood_delta,sex_count,sex_note,bj_count,bj_note,
                       kids_hours,kids_note,general_note,energy_level,stress_level,
                       focus_quality,alcohol,caffeine,created_at
                FROM bak.daily_log
            """)
            _log.info("Migrated daily_log")
        except Exception as e:
            _log.warning(f"Skip daily_log: {e}")

        # category_favourites
        try:
            _user.execute("INSERT OR IGNORE INTO main.category_favourites (category) SELECT category FROM bak.category_favourites")
        except Exception:
            pass

        # gym_exercises — schema differs significantly
        try:
            _user.execute("DELETE FROM main.gym_exercises")
            _user.execute("""
                INSERT OR REPLACE INTO main.gym_exercises (id,name,muscle_group,equipment,is_favourite)
                SELECT id,name,muscle_group,equipment,0 FROM bak.gym_exercises
            """)
            _log.info("Migrated gym_exercises")
        except Exception as e:
            _log.warning(f"Skip gym_exercises: {e}")

        # gym_workouts — program_type → type
        try:
            if _table_exists(_legacy, "gym_workouts"):
                bak_c = _cols(_legacy, "gym_workouts")
                type_col = "program_type" if "program_type" in bak_c else "type"
                _user.execute(f"""
                    INSERT OR IGNORE INTO main.gym_workouts (id,date,type,start_time,end_time,notes)
                    SELECT id,date,{type_col},start_time,end_time,notes FROM bak.gym_workouts
                """)
                _log.info("Migrated gym_workouts")
        except Exception as e:
            _log.warning(f"Skip gym_workouts: {e}")

        # gym_workout_exercises
        try:
            _user.execute("""
                INSERT OR IGNORE INTO main.gym_workout_exercises (id,workout_id,exercise_id,order_num)
                SELECT id,workout_id,exercise_id,order_num FROM bak.gym_workout_exercises
            """)
        except Exception:
            pass

        # gym_sets — workout_exercise_id → (exercise_id, workout_id)
        try:
            bak_c = _cols(_legacy, "gym_sets")
            if "workout_exercise_id" in bak_c:
                _user.execute("""
                    INSERT OR IGNORE INTO main.gym_sets (id,exercise_id,workout_id,set_number,reps,weight,intensity)
                    SELECT s.id,we.exercise_id,we.workout_id,s.set_num,s.reps,s.weight_kg,s.intensity
                    FROM bak.gym_sets s JOIN bak.gym_workout_exercises we ON s.workout_exercise_id=we.id
                """)
            else:
                _user.execute("""
                    INSERT OR IGNORE INTO main.gym_sets (id,exercise_id,workout_id,set_number,reps,weight,intensity)
                    SELECT id,exercise_id,workout_id,set_number,reps,weight,intensity FROM bak.gym_sets
                """)
            _log.info("Migrated gym_sets")
        except Exception as e:
            _log.warning(f"Skip gym_sets: {e}")

        # gym_programs
        try:
            _user.execute("""
                INSERT OR IGNORE INTO main.gym_programs (id,name,description,is_active)
                SELECT id,name,description,0 FROM bak.gym_programs
            """)
        except Exception:
            pass

        # gym_program_days — day_num → day_order
        try:
            bak_c = _cols(_legacy, "gym_program_days")
            order_col = "day_num" if "day_num" in bak_c else "day_order"
            _user.execute(f"""
                INSERT OR IGNORE INTO main.gym_program_days (id,program_id,day_name,day_order)
                SELECT id,program_id,day_name,{order_col} FROM bak.gym_program_days
            """)
        except Exception:
            pass

        # gym_program_exercises
        try:
            bak_c = _cols(_legacy, "gym_program_exercises")
            sets_col = "target_sets" if "target_sets" in bak_c else "sets_target"
            reps_col = "target_reps" if "target_reps" in bak_c else "reps_target"
            _user.execute(f"""
                INSERT OR IGNORE INTO main.gym_program_exercises (id,program_day_id,exercise_id,sets_target,reps_target,order_num)
                SELECT id,program_day_id,exercise_id,{sets_col},{reps_col},order_num FROM bak.gym_program_exercises
            """)
        except Exception:
            pass

        _user.commit()
        _user.execute("DETACH DATABASE bak")
        _user.close()
        _log.info(f"Personal data migrated to {owner_path}")



def _import_csv(conn: sqlite3.Connection):
    df = pd.read_csv(CSV_PATH)
    df = df.dropna(subset=["date"])
    df["year"] = df["year"].astype("Int64")
    df["month"] = df["month"].astype("Int64")
    df["description"] = df["description"].fillna("")
    df["category"] = df["category"].fillna("")
    df["account"] = df["account"].fillna("")
    df["type"] = df["type"].fillna("EXPENSE")
    df["sub_type"] = df["sub_type"].fillna("EXPENSE_PERSONAL")
    df["amount_eur"] = pd.to_numeric(df["amount_eur"], errors="coerce").fillna(0)
    df["nbu_rate_eur_used"] = pd.to_numeric(df["nbu_rate_eur_used"], errors="coerce").fillna(1)
    cols = list(df.columns)
    placeholders = ",".join("?" * len(cols))
    col_names = ",".join(cols)
    for _, row in df.iterrows():
        values = tuple(None if pd.isna(v) else v for v in row)
        conn.execute(f"INSERT INTO transactions ({col_names}) VALUES ({placeholders})", values)
