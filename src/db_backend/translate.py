"""SQL translation layer: SQLite -> PostgreSQL.

Contains _translate_sql (with LRU cache), all regex patterns,
and conflict column mappings.
"""

import re
from functools import lru_cache

from .user_scope import _PER_USER_TABLES


# ─── Compiled regex patterns ─────────────────────────────────────────────────

_PLACEHOLDER_RE = re.compile(r"\?")
_PRAGMA_RE = re.compile(r"^\s*PRAGMA\s+", re.IGNORECASE)
_INSERT_OR_REPLACE_RE = re.compile(
    r"INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)",
    re.IGNORECASE,
)
_INSERT_OR_IGNORE_RE = re.compile(
    r"INSERT\s+OR\s+IGNORE\s+INTO",
    re.IGNORECASE,
)
_DATETIME_NOW_RE = re.compile(r"datetime\s*\(\s*'now'\s*\)", re.IGNORECASE)
_DATETIME_OFFSET_RE = re.compile(
    r"datetime\s*\(\s*'now'\s*,\s*'(-?\d+)\s+(minute|hour|day|second)s?'\s*\)",
    re.IGNORECASE,
)
_AUTOINCREMENT_RE = re.compile(r"\bAUTOINCREMENT\b", re.IGNORECASE)
_INTEGER_PRIMARY_KEY_AUTO_RE = re.compile(
    r"(\w+)\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT",
    re.IGNORECASE,
)
_CURRENT_TIMESTAMP_DEFAULT_RE = re.compile(
    r"DEFAULT\s+CURRENT_TIMESTAMP",
    re.IGNORECASE,
)
_TIMESTAMP_TYPE_RE = re.compile(
    r"(?<![\".])\bTIMESTAMP\b(?!\s+WITH)(?![\".])", re.IGNORECASE
)
_IFNULL_RE = re.compile(r"\bIFNULL\s*\(", re.IGNORECASE)
_GROUP_CONCAT_RE = re.compile(r"\bGROUP_CONCAT\s*\(", re.IGNORECASE)
_STRFTIME_RE = re.compile(
    r"strftime\s*\(\s*'([^']+)'\s*,\s*([^)]+)\)", re.IGNORECASE
)
_SQLITE_MASTER_RE = re.compile(r"\bsqlite_master\b", re.IGNORECASE)
_LAST_INSERT_ROWID_RE = re.compile(
    r"SELECT\s+last_insert_rowid\s*\(\s*\)", re.IGNORECASE
)


# ─── Conflict column mappings ────────────────────────────────────────────────

# Table -> conflict columns for INSERT OR REPLACE translation.
# Maps table names to the unique constraint columns that PG should use
# for ON CONFLICT. Without this, PG can't resolve which constraint to target.
_CONFLICT_COLUMNS: dict[str, str] = {
    "ai_context_snapshots": "user_id, period_type, period_key, domain",
    "ai_notes": "user_id, section",
    "budgets": "user_id, category, month",
    "category_favourites": "user_id, category",
    "custom_accounts": "user_id, name",
    "custom_categories": "user_id, category",
    "daily_log": "user_id, date",
    "garmin_activities": "user_id, activity_id",
    "garmin_body_composition": "user_id, date",
    "garmin_daily": "user_id, date",
    "garmin_heart_rate": 'user_id, date, "timestamp"',
    "garmin_sleep": "user_id, date",
    "gym_exercises": "user_id, name",
    "gym_programs": "user_id, name",
    "nbu_rates": "date, currency_code",
    "secrets": "user_id, key",
    "user_preferences": "user_id, key",
    "users": "email",
    "withings_measurements": "user_id, date",
}


@lru_cache(maxsize=512)
def _translate_sql(sql: str) -> str:
    """Translate SQLite SQL to PostgreSQL-compatible SQL.

    Results are cached since the same SQL templates are used repeatedly.
    """
    # Lazy import to allow patching src.db_backend.DB_BACKEND / is_postgres in tests
    import src.db_backend as _pkg
    if not _pkg.is_postgres():
        return sql

    # Skip PRAGMA statements
    if _PRAGMA_RE.match(sql):
        return ""

    out = sql

    # CREATE TABLE for per-user tables: add user_id column and fix UNIQUE constraints
    _create_match = re.search(
        r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(",
        out, re.IGNORECASE,
    )
    if _create_match:
        _ct_table = _create_match.group(1).lower()
        if _ct_table in _PER_USER_TABLES and "user_id" not in out.lower():
            # Add user_id column after the opening parenthesis
            _ct_pos = out.index("(", _create_match.start()) + 1
            out = out[:_ct_pos] + "\n    user_id INTEGER," + out[_ct_pos:]
            # Replace inline UNIQUE on non-PK columns with composite (user_id, col)
            # e.g. "date TEXT UNIQUE NOT NULL" -> "date TEXT NOT NULL"
            _extracted_uniques = []
            def _strip_inline_unique(m):
                full = m.group(0)
                col_name = m.group(1)
                # Skip id/AUTOINCREMENT PRIMARY KEY columns (surrogate keys)
                if "PRIMARY" in full.upper() and "AUTOINCREMENT" in full.upper():
                    return full
                if col_name.lower() == "id" and "PRIMARY" in full.upper():
                    return full
                _extracted_uniques.append(col_name)
                # Remove UNIQUE or PRIMARY KEY keywords, keep everything else
                result = re.sub(r"\bPRIMARY\s+KEY\b", "", full, flags=re.IGNORECASE)
                result = result.replace("UNIQUE", "").replace("  ", " ")
                return result
            out = re.sub(
                r"^\s+(\w+)\s+[^,\n]*(?:\bUNIQUE\b|\bPRIMARY\s+KEY\b)[^,\n]*",
                _strip_inline_unique, out, flags=re.MULTILINE | re.IGNORECASE,
            )
            # Add composite UNIQUE constraints with user_id before closing )
            if _extracted_uniques:
                _constraints = ",\n    ".join(
                    f"UNIQUE(user_id, {col})" for col in _extracted_uniques
                )
                # Insert before the final closing parenthesis
                _last_paren_pos = out.rfind(")")
                out = out[:_last_paren_pos] + ",\n    " + _constraints + "\n)"

    # INSERT OR REPLACE -> INSERT ... ON CONFLICT DO UPDATE
    m = _INSERT_OR_REPLACE_RE.search(out)
    if m:
        table = m.group(1)
        cols = m.group(2)
        vals = m.group(3)
        col_list = [c.strip() for c in cols.split(",")]
        # Use known conflict columns, filtered to only those present in INSERT
        known = _CONFLICT_COLUMNS.get(table, "")
        if known:
            conflict_col_list = [c.strip() for c in known.split(",") if c.strip() in col_list]
        if not known or not conflict_col_list:
            conflict_col_list = [col_list[0]]
        conflict_cols = ", ".join(conflict_col_list)
        # Exclude conflict columns from the UPDATE SET clause
        update_cols = [c for c in col_list if c not in conflict_col_list]
        updates = ", ".join(f"{c}=EXCLUDED.{c}" for c in update_cols)
        if updates:
            replacement = (
                f"INSERT INTO {table} ({cols}) VALUES ({vals}) "
                f"ON CONFLICT ({conflict_cols}) DO UPDATE SET {updates}"
            )
        else:
            replacement = (
                f"INSERT INTO {table} ({cols}) VALUES ({vals}) "
                f"ON CONFLICT ({conflict_cols}) DO NOTHING"
            )
        out = out[:m.start()] + replacement + out[m.end():]

    # INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
    out = _INSERT_OR_IGNORE_RE.sub("INSERT INTO", out)
    if "ON CONFLICT" not in out and "INSERT INTO" in out.upper() and "OR IGNORE" in sql.upper():
        out = out.rstrip().rstrip(";")
        out += " ON CONFLICT DO NOTHING"

    # datetime('now', '-10 minutes') -> NOW() - INTERVAL '10 minutes'
    def _replace_datetime_offset(m):
        val = m.group(1)
        unit = m.group(2)
        return f"NOW() - INTERVAL '{abs(int(val))} {unit}s'"
    out = _DATETIME_OFFSET_RE.sub(_replace_datetime_offset, out)

    # datetime('now') -> NOW()
    out = _DATETIME_NOW_RE.sub("NOW()", out)

    # AUTOINCREMENT -> (remove, SERIAL handles it)
    # INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL PRIMARY KEY
    out = _INTEGER_PRIMARY_KEY_AUTO_RE.sub(r"\1 SERIAL PRIMARY KEY", out)
    out = _AUTOINCREMENT_RE.sub("", out)

    # IFNULL -> COALESCE
    out = _IFNULL_RE.sub("COALESCE(", out)

    # GROUP_CONCAT(expr) -> STRING_AGG(expr, ',')
    # GROUP_CONCAT(expr, sep) -> STRING_AGG(expr, sep)
    # PG requires STRING_AGG(expr, delimiter) -- add ',' when only 1 arg
    def _gc_replace(sql_str):
        result = []
        i = 0
        while i < len(sql_str):
            gc_m = _GROUP_CONCAT_RE.search(sql_str, i)
            if not gc_m:
                result.append(sql_str[i:])
                break
            result.append(sql_str[i:gc_m.start()])
            # Find matching closing paren
            paren_start = gc_m.end()
            depth = 1
            j = paren_start
            while j < len(sql_str) and depth > 0:
                if sql_str[j] == '(':
                    depth += 1
                elif sql_str[j] == ')':
                    depth -= 1
                j += 1
            inner = sql_str[paren_start:j - 1]
            # Check if separator arg exists (top-level comma)
            _d = 0
            _has_sep = False
            for _ch in inner:
                if _ch == '(':
                    _d += 1
                elif _ch == ')':
                    _d -= 1
                elif _ch == ',' and _d == 0:
                    _has_sep = True
                    break
            if _has_sep:
                result.append(f"STRING_AGG({inner})")
            else:
                result.append(f"STRING_AGG({inner}, ',')")
            i = j
        return "".join(result)
    if _GROUP_CONCAT_RE.search(out):
        out = _gc_replace(out)

    # strftime('%Y-%m', date) -> TO_CHAR(date::DATE, 'YYYY-MM')
    # Cast to DATE because date columns are TEXT in this schema
    def _replace_strftime(m):
        fmt = m.group(1)
        expr = m.group(2).strip()
        pg_fmt = fmt.replace("%Y", "YYYY").replace("%m", "MM").replace("%d", "DD")
        pg_fmt = pg_fmt.replace("%W", "IW").replace("%w", "ID")
        pg_fmt = pg_fmt.replace("%H", "HH24").replace("%M", "MI").replace("%S", "SS")
        _has_time = any(t in pg_fmt for t in ("HH24", "MI", "SS"))
        _cast = "TIMESTAMP" if _has_time else "DATE"
        return f"TO_CHAR({expr}::{_cast}, '{pg_fmt}')"
    out = _STRFTIME_RE.sub(_replace_strftime, out)

    # sqlite_master -> pg_catalog.pg_tables (approximate)
    out = _SQLITE_MASTER_RE.sub("pg_catalog.pg_tables", out)

    # last_insert_rowid() -> lastval()
    out = _LAST_INSERT_ROWID_RE.sub("SELECT lastval()", out)

    # TIMESTAMP -> TIMESTAMPTZ
    out = _TIMESTAMP_TYPE_RE.sub("TIMESTAMPTZ", out)

    # Boolean columns: col = 0 -> col = false, col = 1 -> col = true
    _bool_cols = (
        "active", "is_active", "confirmed", "is_custom",
        "is_failure", "is_warmup", "is_liability",
    )
    for bool_col in _bool_cols:
        out = re.sub(rf"\b{bool_col}\s*=\s*1\b", f"{bool_col} = true", out)
        out = re.sub(rf"\b{bool_col}\s*=\s*0\b", f"{bool_col} = false", out)

    # PG 16: bare column refs in ON CONFLICT DO UPDATE SET are ambiguous.
    # Qualify them with the table name: COALESCE(excluded.col, col) -> COALESCE(excluded.col, tbl.col)
    _conflict_update = re.search(
        r"INSERT\s+INTO\s+(\w+).*?ON\s+CONFLICT.*?DO\s+UPDATE\s+SET\s+",
        out, re.IGNORECASE | re.DOTALL,
    )
    if _conflict_update:
        _tbl = _conflict_update.group(1)
        _set_start = _conflict_update.end()
        _set_clause = out[_set_start:]
        # Replace bare col refs in COALESCE(excluded.X, Y) with COALESCE(excluded.X, tbl.Y)
        _set_clause = re.sub(
            r",\s*(\w+)\)",
            lambda m: f", {_tbl}.{m.group(1)})" if not m.group(1).startswith(("excluded", _tbl)) else m.group(0),
            _set_clause,
        )
        out = out[:_set_start] + _set_clause

    # ? -> %s placeholders
    out = _PLACEHOLDER_RE.sub("%s", out)

    return out
