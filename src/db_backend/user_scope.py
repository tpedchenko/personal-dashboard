"""Per-user table scoping: auto-inject user_id for PostgreSQL multi-tenant queries."""

import re
import threading

# ─── Per-user tables: auto-inject user_id for PostgreSQL ─────────────────────
# Tables that have a user_id column and need automatic scoping per user.
_PER_USER_TABLES: set[str] = {
    "ai_context_snapshots", "ai_notes", "budget_config", "budgets",
    "category_favourites", "chat_history",
    "custom_accounts", "custom_categories", "daily_log", "food_log",
    "garmin_activities", "garmin_body_composition", "garmin_daily",
    "garmin_heart_rate", "garmin_sleep", "garmin_staging", "mandatory_categories",
    "gym_exercises", "gym_program_days", "gym_program_exercises",
    "gym_programs", "gym_sets", "gym_workout_exercises", "gym_workouts",
    "recurring_transactions", "savings_goals",
    "secrets", "shopping_history", "shopping_items", "transactions",
    "user_preferences", "withings_measurements",
}

# Cache: email -> user_id (populated on first lookup)
_user_id_cache: dict[str, int] = {}
_user_id_cache_lock = threading.Lock()


def _get_user_id_for_email(email: str, pg_conn) -> int:
    """Look up user_id for an email. Uses cache. Creates user if not found."""
    if email in _user_id_cache:
        return _user_id_cache[email]
    with _user_id_cache_lock:
        if email in _user_id_cache:
            return _user_id_cache[email]
        cur = pg_conn.cursor()
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        if row:
            _user_id_cache[email] = row[0]
            return row[0]
        # User doesn't exist yet -- will be created by auth flow; use 0 as sentinel
        return 0


def _current_pg_user_id(pg_conn) -> int:
    """Get user_id for the current context user."""
    from src.database import get_current_user_email
    email = get_current_user_email()
    if not email:
        return 0
    return _get_user_id_for_email(email, pg_conn)


# Regex for detecting table names in SQL statements
_INSERT_TABLE_RE = re.compile(
    r"INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(", re.IGNORECASE
)
_SELECT_FROM_RE = re.compile(r"\bFROM\s+(\w+)", re.IGNORECASE)
_TABLE_ALIAS_RE = re.compile(r"\bFROM\s+(\w+)\s+(?:AS\s+)?(\w+)", re.IGNORECASE)
_UPDATE_TABLE_RE = re.compile(r"UPDATE\s+(\w+)\s+SET\b", re.IGNORECASE)
_DELETE_TABLE_RE = re.compile(r"DELETE\s+FROM\s+(\w+)", re.IGNORECASE)
_WHERE_RE = re.compile(r"\bWHERE\b", re.IGNORECASE)
_ORDER_GROUP_LIMIT_RE = re.compile(
    r"\b(ORDER\s+BY|GROUP\s+BY|LIMIT|HAVING|$)", re.IGNORECASE
)


def _inject_user_id(sql: str, params, pg_conn) -> tuple[str, tuple]:
    """Auto-inject user_id into SQL for per-user tables in PostgreSQL.

    - INSERT: adds user_id column and value if missing
    - SELECT/UPDATE/DELETE: adds user_id = %s filter if missing
    Returns (modified_sql, modified_params).
    """
    # Lazy imports to allow patching src.db_backend._current_pg_user_id in tests
    # and to avoid circular import for _CONFLICT_COLUMNS
    import src.db_backend as _pkg
    from .translate import _CONFLICT_COLUMNS

    # Skip if already has user_id reference
    if "user_id" in sql.lower():
        return sql, params

    # Skip DDL
    upper = sql.strip().upper()
    if upper.startswith(("CREATE ", "ALTER ", "DROP ")):
        return sql, params

    params_list = list(params) if params else []
    uid = _pkg._current_pg_user_id(pg_conn)
    if uid == 0:
        return sql, params

    # INSERT: inject user_id column and value
    m = _INSERT_TABLE_RE.search(sql)
    if m and m.group(1).lower() in _PER_USER_TABLES:
        table = m.group(1)
        # Find the opening ( after table name, inject user_id as first column
        col_start = sql.index("(", m.start()) + 1
        sql = sql[:col_start] + "user_id, " + sql[col_start:]
        # Find VALUES ( and inject %s as first value
        vals_match = re.search(r"VALUES\s*\(", sql, re.IGNORECASE)
        if vals_match:
            val_start = sql.index("(", vals_match.start()) + 1
            sql = sql[:val_start] + "%s, " + sql[val_start:]
            params_list.insert(0, uid)
        # Fix ON CONFLICT clause: replace with correct conflict columns
        # that match the actual UNIQUE constraint (which includes user_id).
        conflict_match = re.search(r"ON\s+CONFLICT\s*\(([^)]+)\)", sql, re.IGNORECASE)
        if conflict_match:
            known = _CONFLICT_COLUMNS.get(table.lower(), "")
            if known:
                # Use the authoritative conflict columns from _CONFLICT_COLUMNS
                sql = sql[:conflict_match.start(1)] + known + sql[conflict_match.end(1):]
            else:
                # Fallback: prepend user_id if not already present
                existing_cols = conflict_match.group(1)
                if "user_id" not in existing_cols.lower():
                    new_cols = "user_id, " + existing_cols
                    sql = sql[:conflict_match.start(1)] + new_cols + sql[conflict_match.end(1):]
        return sql, tuple(params_list)

    # SELECT: inject WHERE user_id = %s (appended at end of WHERE to match param order)
    if upper.startswith("SELECT"):
        m = _SELECT_FROM_RE.search(sql)
        if not m or m.group(1).lower() not in _PER_USER_TABLES:
            return sql, tuple(params_list)

        table_name = m.group(1).lower()
        # Check if matched table is inside a subquery (paren depth > 0 at match pos)
        _depth = 0
        for ch in sql[:m.start()]:
            if ch == '(':
                _depth += 1
            elif ch == ')':
                _depth -= 1
        if _depth > 0:
            # Check for UNION/INTERSECT/EXCEPT -- these need manual handling
            if re.search(r"\bUNION\b|\bINTERSECT\b|\bEXCEPT\b", sql, re.IGNORECASE):
                return sql, tuple(params_list)
            # Simple subquery (no UNION) -- proceed with injection inside it

        # Determine table alias (e.g. FROM gym_workouts w -> alias "w")
        _alias = None
        _alias_m = _TABLE_ALIAS_RE.search(sql)
        if _alias_m and _alias_m.group(1).lower() == table_name:
            _kw = {"where", "join", "left", "right", "inner", "outer", "cross",
                   "on", "and", "or", "order", "group", "having", "limit",
                   "union", "except", "intersect", "as", "set", "values"}
            candidate = _alias_m.group(2)
            if candidate.lower() not in _kw:
                _alias = candidate

        # If JOINs present, qualify user_id with alias/table to avoid ambiguity
        _has_join = bool(re.search(r"\bJOIN\b", sql, re.IGNORECASE))
        if _has_join and _alias:
            uid_col = f"{_alias}.user_id"
        elif _has_join:
            uid_col = f"{table_name}.user_id"
        else:
            uid_col = "user_id"

        wm = _WHERE_RE.search(sql, m.end())
        if wm:
            # Append AND <uid_col> = %s before ORDER BY/GROUP BY/LIMIT or at end
            tail = _ORDER_GROUP_LIMIT_RE.search(sql, wm.end())
            insert_pos = tail.start() if tail and tail.group() else len(sql)
            sql = sql[:insert_pos] + f" AND {uid_col} = %s " + sql[insert_pos:]
        else:
            # No WHERE -- insert before ORDER BY/GROUP BY/LIMIT or at end
            tail = _ORDER_GROUP_LIMIT_RE.search(sql, m.end())
            insert_pos = tail.start() if tail and tail.group() else len(sql)
            sql = sql[:insert_pos] + f" WHERE {uid_col} = %s " + sql[insert_pos:]
        # Insert uid param at the correct position matching the placeholder.
        # Count placeholders (both ? for SQLite and %s for PG) before insert_pos.
        _before = sql[:insert_pos]
        _param_idx = _before.count("%s") + _before.count("?")
        params_list.insert(_param_idx, uid)
        return sql, tuple(params_list)

    # UPDATE: inject AND user_id = %s (appended to match param order)
    m = _UPDATE_TABLE_RE.search(sql)
    if m and m.group(1).lower() in _PER_USER_TABLES:
        wm = _WHERE_RE.search(sql, m.end())
        if wm:
            sql = sql.rstrip().rstrip(";") + " AND user_id = %s"
        else:
            sql = sql.rstrip().rstrip(";") + " WHERE user_id = %s"
        params_list.append(uid)
        return sql, tuple(params_list)

    # DELETE: inject AND user_id = %s (appended to match param order)
    m = _DELETE_TABLE_RE.search(sql)
    if m and m.group(1).lower() in _PER_USER_TABLES:
        wm = _WHERE_RE.search(sql, m.end())
        if wm:
            sql = sql.rstrip().rstrip(";") + " AND user_id = %s"
        else:
            sql = sql.rstrip().rstrip(";") + " WHERE user_id = %s"
        params_list.append(uid)
        return sql, tuple(params_list)

    return sql, tuple(params_list)
