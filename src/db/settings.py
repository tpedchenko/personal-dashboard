"""Custom accounts, custom categories, favourites, preferences, budgets, savings goals,
recurring transactions, chat history, budget calculator."""

from .core import get_conn, _get_table_columns, read_sql, CREATE_CUSTOM_ACCOUNTS_SQL


# ─── Schema SQL constants used by core.init_db ──────────────────────────────

CREATE_SAVINGS_GOALS_SQL = """
CREATE TABLE IF NOT EXISTS savings_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_eur REAL NOT NULL,
    current_eur REAL DEFAULT 0,
    deadline TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_BUDGETS_SQL = """
CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    month TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, month)
)
"""

CREATE_RECURRING_SQL = """
CREATE TABLE IF NOT EXISTS recurring_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    category TEXT NOT NULL,
    tx_type TEXT DEFAULT 'EXPENSE',
    account TEXT DEFAULT 'Taras Mono',
    day_of_month INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_CHAT_HISTORY_SQL = """
CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_BUDGET_CONFIG_SQL = """
CREATE TABLE IF NOT EXISTS budget_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    limit_type TEXT NOT NULL DEFAULT 'fixed',
    limit_value REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""
# limit_type: 'fixed' | 'pct_current_income' | 'pct_avg_income'
# limit_value: EUR amount for fixed, percentage (0-100) for pct types

CREATE_MANDATORY_CATEGORIES_SQL = """
CREATE TABLE IF NOT EXISTS mandatory_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)"""


# ─── Custom accounts ──────────────────────────────────────────────────────────

def get_custom_accounts(active_only: bool = True) -> list[dict]:
    """Return custom accounts as list of dicts with id, name, currency, is_active, sort_order, initial_balance."""
    with get_conn() as conn:
        conn.execute(CREATE_CUSTOM_ACCOUNTS_SQL)
        # Ensure initial_balance column exists (migration safety)
        _cols = _get_table_columns(conn, "custom_accounts")
        _has_ib = "initial_balance" in _cols
        _select = "SELECT id, name, currency, is_active, sort_order, initial_balance" if _has_ib else "SELECT id, name, currency, is_active, sort_order, 0"
        if active_only:
            rows = conn.execute(
                f"{_select} FROM custom_accounts "
                "WHERE is_active=1 ORDER BY sort_order, name"
            ).fetchall()
        else:
            rows = conn.execute(
                f"{_select} FROM custom_accounts "
                "ORDER BY sort_order, name"
            ).fetchall()
    return [
        {"id": r[0], "name": r[1], "currency": r[2], "is_active": bool(r[3]), "sort_order": r[4], "initial_balance": r[5] or 0.0}
        for r in rows
    ]


def get_account_names(active_only: bool = True) -> list[str]:
    """Return list of active account names (for dropdowns).

    Combines custom_accounts (dynamic) with distinct account names from transactions.
    """
    from .transactions import get_accounts
    accounts = get_custom_accounts(active_only=active_only)
    names = [a["name"] for a in accounts]
    # Also include any account names found in transactions that aren't in custom_accounts
    db_accounts = get_accounts()
    seen = set(names)
    for a in db_accounts:
        if a not in seen:
            seen.add(a)
            names.append(a)
    return names


def get_account_currency_map() -> dict[str, str]:
    """Return {account_name: currency_symbol} from custom_accounts table."""
    with get_conn() as conn:
        conn.execute(CREATE_CUSTOM_ACCOUNTS_SQL)
        rows = conn.execute(
            "SELECT name, currency FROM custom_accounts ORDER BY sort_order, name"
        ).fetchall()
    return {r[0]: r[1] for r in rows}


def add_custom_account(name: str, currency: str = "€") -> int | None:
    """Add a custom account. Returns the new account id, or None if duplicate."""
    with get_conn() as conn:
        conn.execute(CREATE_CUSTOM_ACCOUNTS_SQL)
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM custom_accounts"
        ).fetchone()[0]
        try:
            cur = conn.execute(
                "INSERT INTO custom_accounts (name, currency, sort_order) VALUES (?, ?, ?)",
                (name, currency, max_order + 1),
            )
            return cur.lastrowid
        except Exception:
            return None


def update_custom_account(account_id: int, name: str | None = None,
                          currency: str | None = None, is_active: bool | None = None,
                          initial_balance: float | None = None, sort_order: int | None = None):
    """Update a custom account's name, currency, active status, initial balance, or sort order.

    When name is changed, also update all transactions referencing the old name.
    """
    with get_conn() as conn:
        if name is not None:
            old_row = conn.execute("SELECT name FROM custom_accounts WHERE id=?", (account_id,)).fetchone()
            if old_row and old_row[0] != name:
                old_name = old_row[0]
                conn.execute("UPDATE custom_accounts SET name=? WHERE id=?", (name, account_id))
                conn.execute("UPDATE transactions SET account=? WHERE account=?", (name, old_name))
                conn.execute("UPDATE recurring_transactions SET account=? WHERE account=?", (name, old_name))
            else:
                conn.execute("UPDATE custom_accounts SET name=? WHERE id=?", (name, account_id))
        if currency is not None:
            conn.execute("UPDATE custom_accounts SET currency=? WHERE id=?", (currency, account_id))
        if is_active is not None:
            conn.execute("UPDATE custom_accounts SET is_active=? WHERE id=?", (int(is_active), account_id))
        if initial_balance is not None:
            conn.execute("UPDATE custom_accounts SET initial_balance=? WHERE id=?", (initial_balance, account_id))
        if sort_order is not None:
            conn.execute("UPDATE custom_accounts SET sort_order=? WHERE id=?", (sort_order, account_id))


def delete_custom_account(account_id: int, migrate_to_account: str | None = None):
    """Delete a custom account. Migrate its transactions to another account first."""
    with get_conn() as conn:
        old_row = conn.execute("SELECT name FROM custom_accounts WHERE id=?", (account_id,)).fetchone()
        if not old_row:
            return
        old_name = old_row[0]
        if migrate_to_account:
            conn.execute(
                "UPDATE transactions SET account=? WHERE account=?",
                (migrate_to_account, old_name),
            )
        conn.execute("DELETE FROM custom_accounts WHERE id=?", (account_id,))


def get_custom_categories() -> list[str]:
    """Get custom categories (used by settings and also by core.get_all_categories_flat for non-owner users)."""
    from .core import CREATE_CUSTOM_CATEGORIES_SQL
    with get_conn() as conn:
        conn.execute(CREATE_CUSTOM_CATEGORIES_SQL)
        rows = conn.execute("SELECT category FROM custom_categories ORDER BY category").fetchall()
    return [r[0] for r in rows]


# ─── Savings Goals ─────────────────────────────────────────────────────────────

def get_savings_goals() -> list[dict]:
    """Get all active savings goals."""
    with get_conn() as conn:
        conn.execute(CREATE_SAVINGS_GOALS_SQL)
        rows = conn.execute(
            "SELECT id, name, target_eur, current_eur, deadline FROM savings_goals WHERE active = 1 ORDER BY deadline"
        ).fetchall()
    return [{"id": r[0], "name": r[1], "target_eur": r[2], "current_eur": r[3], "deadline": r[4]} for r in rows]


def add_savings_goal(name: str, target_eur: float, deadline: str | None = None) -> int:
    with get_conn() as conn:
        conn.execute(CREATE_SAVINGS_GOALS_SQL)
        conn.execute(
            "INSERT INTO savings_goals (name, target_eur, deadline) VALUES (?, ?, ?)",
            (name, target_eur, deadline),
        )
        lastrowid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return lastrowid


def update_savings_goal(goal_id: int, current_eur: float):
    with get_conn() as conn:
        conn.execute("UPDATE savings_goals SET current_eur = ? WHERE id = ?", (current_eur, goal_id))



def delete_savings_goal(goal_id: int):
    with get_conn() as conn:
        conn.execute("UPDATE savings_goals SET active = 0 WHERE id = ?", (goal_id,))



# ─── Budgets ───────────────────────────────────────────────────────────────────

def get_budgets(month: str | None = None) -> list[dict]:
    """Get all active budgets. month format: 'YYYY-MM' or None for global."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, category, amount_eur, month FROM budgets WHERE active = 1 ORDER BY category"
        ).fetchall()
    return [{"id": r[0], "category": r[1], "amount_eur": r[2], "month": r[3]} for r in rows]


def set_budget(category: str, amount_eur: float, month: str | None = None) -> int:
    """Create or update a budget for a category."""
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO budgets (category, amount_eur, month)
               VALUES (?, ?, ?)
               ON CONFLICT(category, month) DO UPDATE SET amount_eur = excluded.amount_eur, active = 1""",
            (category, amount_eur, month),
        )
        lastrowid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return lastrowid


def delete_budget(budget_id: int):
    """Deactivate a budget."""
    with get_conn() as conn:
        conn.execute("UPDATE budgets SET active = 0 WHERE id = ?", (budget_id,))



def get_budget_status(month_start: str, month_end: str) -> list[dict]:
    """Get budget vs actual spending for a month. Returns category, budget, spent.

    Includes subcategory spending: e.g. budget for "Харчування і необхідне"
    also counts transactions in "Харчування і необхідне / Супермаркет".
    """
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT b.id, b.category, b.amount_eur as budget,
                   COALESCE(SUM(t.amount_eur), 0) as spent
            FROM budgets b
            LEFT JOIN transactions t
                ON (t.category = b.category OR t.category LIKE b.category || ' / ' || ?)
                AND t.type = 'EXPENSE'
                AND COALESCE(t.sub_type, '') != 'TRANSFER'
                AND t.date >= ? AND t.date <= ?
            WHERE b.active = 1
            GROUP BY b.id, b.category, b.amount_eur
            ORDER BY (COALESCE(SUM(t.amount_eur), 0) / b.amount_eur) DESC
        """, ("%", month_start, month_end)).fetchall()
    return [{
        "id": r[0], "category": r[1], "budget": r[2], "spent": r[3],
        "pct": round(r[3] / r[2] * 100, 1) if r[2] > 0 else 0,
    } for r in rows]


# ─── Budget Auto-Calculator ─────────────────────────────────────────────────

def _ensure_budget_calc_tables():
    """Create budget_config and mandatory_categories tables if not exist."""
    with get_conn() as conn:
        conn.execute(CREATE_BUDGET_CONFIG_SQL)
        conn.execute(CREATE_MANDATORY_CATEGORIES_SQL)


def get_budget_config() -> dict | None:
    """Get budget auto-calc configuration."""
    _ensure_budget_calc_tables()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, limit_type, limit_value FROM budget_config ORDER BY id DESC LIMIT 1"
        ).fetchone()
    if not row:
        return None
    return {"id": row[0], "limit_type": row[1], "limit_value": row[2]}


def set_budget_config(limit_type: str, limit_value: float):
    """Set or update budget auto-calc config (single row, upsert)."""
    _ensure_budget_calc_tables()
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM budget_config LIMIT 1").fetchone()
        if existing:
            conn.execute(
                "UPDATE budget_config SET limit_type = ?, limit_value = ? WHERE id = ?",
                (limit_type, limit_value, existing[0]),
            )
        else:
            conn.execute(
                "INSERT INTO budget_config (limit_type, limit_value) VALUES (?, ?)",
                (limit_type, limit_value),
            )


def get_mandatory_categories() -> list[str]:
    """Get list of mandatory expense categories."""
    _ensure_budget_calc_tables()
    with get_conn() as conn:
        rows = conn.execute("SELECT category FROM mandatory_categories ORDER BY category").fetchall()
    return [r[0] for r in rows]


def add_mandatory_category(category: str):
    """Add a mandatory category."""
    _ensure_budget_calc_tables()
    with get_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO mandatory_categories (category) VALUES (?)",
            (category,),
        )


def remove_mandatory_category(category: str):
    """Remove a mandatory category."""
    _ensure_budget_calc_tables()
    with get_conn() as conn:
        conn.execute("DELETE FROM mandatory_categories WHERE category = ?", (category,))


def get_avg_monthly_expenses(categories: list[str], months: int = 12) -> dict:
    """Calculate average monthly expenses per category over the last N months.

    Returns {category: avg_monthly_eur}. Uses full months only.
    """
    from datetime import date
    from src.date_utils import month_start, months_ago_start
    today = date.today()
    current_month_start = month_start(today)
    start = months_ago_start(months, today)

    with get_conn() as conn:
        result = {}
        for cat in categories:
            rows = conn.execute("""
                SELECT SUBSTR(date, 1, 7) as m, SUM(amount_eur)
                FROM transactions
                WHERE type = 'EXPENSE'
                  AND COALESCE(sub_type, '') != 'TRANSFER'
                  AND (category = ? OR category LIKE ?)
                  AND date >= ? AND date < ?
                GROUP BY SUBSTR(date, 1, 7)
            """, (cat, cat + " / %", start.isoformat(), current_month_start.isoformat())).fetchall()
            if rows:
                total = sum(r[1] for r in rows)
                n_months = len(rows)
                result[cat] = round(total / n_months, 2)
            else:
                result[cat] = 0.0
    return result


def get_avg_monthly_income(months: int = 12) -> float:
    """Calculate average monthly income over the last N full months."""
    from datetime import date
    from src.date_utils import month_start, months_ago_start
    today = date.today()
    current_month_start = month_start(today)
    start = months_ago_start(months, today)

    with get_conn() as conn:
        rows = conn.execute("""
            SELECT SUBSTR(date, 1, 7) as m, SUM(amount_eur)
            FROM transactions
            WHERE type = 'INCOME'
              AND COALESCE(sub_type, '') != 'TRANSFER'
              AND date >= ? AND date < ?
            GROUP BY SUBSTR(date, 1, 7)
        """, (start.isoformat(), current_month_start.isoformat())).fetchall()
    if not rows:
        return 0.0
    return round(sum(r[1] for r in rows) / len(rows), 2)


def get_current_month_income() -> float:
    """Get total income for the current month so far."""
    from datetime import date
    from src.date_utils import month_start_iso
    today = date.today()
    month_start = month_start_iso(today)

    with get_conn() as conn:
        row = conn.execute("""
            SELECT COALESCE(SUM(amount_eur), 0)
            FROM transactions
            WHERE type = 'INCOME'
              AND COALESCE(sub_type, '') != 'TRANSFER'
              AND date >= ? AND date <= ?
        """, (month_start, today.isoformat())).fetchone()
    return float(row[0]) if row else 0.0


def calculate_weekly_budget() -> dict | None:
    """Calculate the weekly discretionary budget.

    Returns dict with: monthly_limit, mandatory_total, discretionary,
    weeks_remaining, weekly_budget, spent_this_month, remaining,
    mandatory_breakdown, limit_type, limit_value.
    Returns None if no budget config set.
    """
    import calendar
    from datetime import date
    from src.date_utils import month_start as _month_start

    config = get_budget_config()
    if not config:
        return None

    today = date.today()
    month_start = _month_start(today)
    _, days_in_month = calendar.monthrange(today.year, today.month)

    # Calculate monthly limit
    if config["limit_type"] == "fixed":
        monthly_limit = config["limit_value"]
    elif config["limit_type"] == "pct_current_income":
        monthly_limit = get_current_month_income() * config["limit_value"] / 100
    elif config["limit_type"] == "pct_avg_income":
        monthly_limit = get_avg_monthly_income() * config["limit_value"] / 100
    else:
        monthly_limit = config["limit_value"]

    # Get mandatory categories and their average expenses
    mandatory_cats = get_mandatory_categories()
    mandatory_breakdown = get_avg_monthly_expenses(mandatory_cats) if mandatory_cats else {}
    mandatory_total = sum(mandatory_breakdown.values())

    # Discretionary = limit - mandatory
    discretionary = max(0, monthly_limit - mandatory_total)

    # Weeks remaining in month (including current partial week)
    days_remaining = days_in_month - today.day + 1
    weeks_remaining = max(1, days_remaining / 7)

    # Weekly budget
    weekly_budget = round(discretionary / weeks_remaining, 2) if weeks_remaining > 0 else 0

    # Actual non-mandatory spending this month
    with get_conn() as conn:
        # All expenses this month excluding transfers
        row = conn.execute("""
            SELECT COALESCE(SUM(amount_eur), 0)
            FROM transactions
            WHERE type = 'EXPENSE'
              AND COALESCE(sub_type, '') != 'TRANSFER'
              AND date >= ? AND date <= ?
        """, (month_start.isoformat(), today.isoformat())).fetchone()
        total_spent = float(row[0]) if row else 0.0

        # Mandatory category spending this month (single query instead of N+1)
        mandatory_spent = 0.0
        if mandatory_cats:
            _cat_clauses = " OR ".join(
                "(category = ? OR category LIKE ?)" for _ in mandatory_cats
            )
            _cat_params: list = []
            for cat in mandatory_cats:
                _cat_params.extend([cat, cat + " / %"])
            r = conn.execute(f"""
                SELECT COALESCE(SUM(amount_eur), 0)
                FROM transactions
                WHERE type = 'EXPENSE'
                  AND COALESCE(sub_type, '') != 'TRANSFER'
                  AND ({_cat_clauses})
                  AND date >= ? AND date <= ?
            """, _cat_params + [month_start.isoformat(), today.isoformat()]).fetchone()
            mandatory_spent = float(r[0]) if r else 0.0

    discretionary_spent = total_spent - mandatory_spent
    remaining = discretionary - discretionary_spent

    return {
        "monthly_limit": round(monthly_limit, 2),
        "mandatory_total": round(mandatory_total, 2),
        "mandatory_breakdown": mandatory_breakdown,
        "discretionary": round(discretionary, 2),
        "weeks_remaining": round(weeks_remaining, 1),
        "weekly_budget": weekly_budget,
        "total_spent": round(total_spent, 2),
        "mandatory_spent": round(mandatory_spent, 2),
        "discretionary_spent": round(discretionary_spent, 2),
        "remaining": round(remaining, 2),
        "limit_type": config["limit_type"],
        "limit_value": config["limit_value"],
    }


# ─── Recurring Transactions ─────────────────────────────────────────────────

def get_recurring_transactions() -> list[dict]:
    """Get all active recurring transactions."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, amount_eur, category, tx_type, account, day_of_month "
            "FROM recurring_transactions WHERE active = 1 ORDER BY day_of_month"
        ).fetchall()
    return [{"id": r[0], "name": r[1], "amount_eur": r[2], "category": r[3],
             "tx_type": r[4], "account": r[5], "day_of_month": r[6]} for r in rows]


def add_recurring_transaction(name: str, amount_eur: float, category: str,
                               tx_type: str = "EXPENSE", account: str = "Taras Mono",
                               day_of_month: int = 1) -> int:
    """Add a recurring transaction."""
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO recurring_transactions
               (name, amount_eur, category, tx_type, account, day_of_month)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (name, amount_eur, category, tx_type, account, day_of_month),
        )
        lastrowid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return lastrowid


def delete_recurring_transaction(rec_id: int):
    """Deactivate a recurring transaction."""
    with get_conn() as conn:
        conn.execute("UPDATE recurring_transactions SET active = 0 WHERE id = ?", (rec_id,))



def process_recurring_transactions(year: int, month: int):
    """Insert recurring transactions for a given month if not already inserted."""
    month_str = f"{year:04d}-{month:02d}"
    with get_conn() as conn:
        recs = conn.execute(
            "SELECT id, name, amount_eur, category, tx_type, account, day_of_month "
            "FROM recurring_transactions WHERE active = 1"
        ).fetchall()
        for r in recs:
            rec_id, name, amount, category, tx_type, account, dom = r
            day = min(dom, 28)  # Safe for all months
            tx_date = f"{month_str}-{day:02d}"
            # Check if already exists (by description containing recurring marker)
            existing = conn.execute(
                "SELECT id FROM transactions WHERE date = ? AND description LIKE ? AND amount_eur = ?",
                (tx_date, f"[auto] {name}%", amount),
            ).fetchone()
            if not existing:
                conn.execute(
                    """INSERT INTO transactions
                       (date, year, month, type, sub_type, account, category,
                        amount_original, currency_original, amount_eur, nbu_rate_eur_used, description, owner)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (tx_date, year, month, tx_type, tx_type, account, category,
                     amount, "€", amount, 1.0, f"[auto] {name}", "Taras"),
                )



# ─── Chat History ────────────────────────────────────────────────────────────

def get_chat_history(limit: int = 50, user_email: str | None = None) -> list[dict]:
    """Get recent chat messages, optionally filtered by user_email."""
    with get_conn() as conn:
        conn.execute(CREATE_CHAT_HISTORY_SQL)
        # Ensure user_email column exists
        _cols = _get_table_columns(conn, "chat_history")
        if "user_email" not in _cols:
            conn.execute("ALTER TABLE chat_history ADD COLUMN user_email TEXT DEFAULT '${OWNER_EMAIL:-admin@example.com}'")
        if user_email:
            rows = conn.execute(
                "SELECT role, content, created_at FROM chat_history WHERE user_email = ? ORDER BY id DESC LIMIT ?",
                (user_email, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT role, content, created_at FROM chat_history ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
    return [{"role": r[0], "content": r[1], "created_at": r[2]} for r in reversed(rows)]


def add_chat_message(role: str, content: str, user_email: str | None = None):
    """Save a chat message."""
    with get_conn() as conn:
        conn.execute(CREATE_CHAT_HISTORY_SQL)
        _cols = _get_table_columns(conn, "chat_history")
        if "user_email" not in _cols:
            conn.execute("ALTER TABLE chat_history ADD COLUMN user_email TEXT DEFAULT '${OWNER_EMAIL:-admin@example.com}'")
        conn.execute(
            "INSERT INTO chat_history (role, content, user_email) VALUES (?, ?, ?)",
            (role, content, user_email or "${OWNER_EMAIL:-admin@example.com}"),
        )


def clear_chat_history(user_email: str | None = None):
    """Clear chat history, optionally for a specific user."""
    with get_conn() as conn:
        if user_email:
            conn.execute("DELETE FROM chat_history WHERE user_email = ?", (user_email,))
        else:
            conn.execute("DELETE FROM chat_history")



# ─── User Preferences ────────────────────────────────────────────────────────

ALL_MODULES = ["Finance", "My Day", "Gym", "Food", "List", "Dashboard", "AI Chat", "Settings"]


def get_user_preference(email: str, key: str, default: str | None = None) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT value FROM user_preferences WHERE user_email = ? AND key = ?",
            (email, key),
        ).fetchone()
    return row[0] if row else default


def set_user_preference(email: str, key: str, value: str):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO user_preferences (user_email, key, value) VALUES (?, ?, ?) "
            "ON CONFLICT(user_email, key) DO UPDATE SET value = excluded.value",
            (email, key, value),
        )


def get_user_preferences(email: str) -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT key, value FROM user_preferences WHERE user_email = ?",
            (email,),
        ).fetchall()
    return {r[0]: r[1] for r in rows}


def get_user_enabled_modules(email: str) -> list[str]:
    """Return list of enabled module names for user, or all if no preferences set."""
    import json as _json
    prefs = get_user_preferences(email)
    enabled = prefs.get("enabled_modules")
    if enabled is None:
        return list(ALL_MODULES)
    return _json.loads(enabled)


def set_user_enabled_modules(email: str, modules: list[str]):
    import json as _json
    set_user_preference(email, "enabled_modules", _json.dumps(modules))
