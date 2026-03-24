"""Transaction CRUD, queries, daily log, food tracking, shopping, AI notes/snapshots."""
import pandas as pd
from datetime import date, timedelta

from .core import (
    get_conn, read_sql, _get_table_columns, _derive_owner,
    CREATE_FAVOURITES_SQL, CREATE_CUSTOM_CATEGORIES_SQL,
    CREATE_SHOPPING_ITEMS_SQL, CREATE_SHOPPING_HISTORY_SQL,
    CREATE_FOOD_LOG_SQL, CREATE_AI_NOTES_SQL, CREATE_AI_CONTEXT_SNAPSHOTS_SQL,
    CATEGORY_MIGRATION,
)


# ─── External ID helpers (dedup for bank sync) ───────────────────────────────

def get_existing_external_ids(prefix: str) -> set[str]:
    """Batch-load all external_ids matching a prefix (e.g. 'bunq_', 'cobee_').

    Returns a set for O(1) membership checks, replacing per-row DB queries.
    """
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT external_id FROM transactions WHERE external_id LIKE ?",
            (f"{prefix}%",),
        ).fetchall()
    return {r[0] for r in rows}


# ─── Transactions ─────────────────────────────────────────────────────────────

def get_transactions(
    year: int | None = None,
    month: int | None = None,
    tx_type: str | None = None,
    category: str | None = None,
    include_transfers: bool = False,
) -> pd.DataFrame:
    sql = "SELECT * FROM transactions WHERE 1=1"
    params: list = []
    if not include_transfers:
        sql += " AND COALESCE(sub_type,'') != 'TRANSFER'"
    if year:
        sql += " AND year = ?"
        params.append(year)
    if month:
        sql += " AND month = ?"
        params.append(month)
    if tx_type:
        sql += " AND type = ?"
        params.append(tx_type)
    if category:
        sql += " AND category LIKE ?"
        params.append(f"%{category}%")
    sql += " ORDER BY date DESC"

    with get_conn() as conn:
        df = read_sql(sql, conn, params)
    df["date"] = pd.to_datetime(df["date"])
    return df


def get_all_transactions(include_transfers: bool = False, user_email: str | None = None) -> pd.DataFrame:
    clauses: list[str] = []
    params: list = []
    if not include_transfers:
        clauses.append("COALESCE(sub_type,'') != 'TRANSFER'")
    if user_email:
        pass  # per-user DB: all data belongs to current user
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT * FROM transactions{where} ORDER BY date"
    with get_conn() as conn:
        df = read_sql(sql, conn, params)
    df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d", errors="coerce")
    return df


def get_dashboard_kpi(year: int, month: int) -> dict:
    """Return lightweight KPI dict for the dashboard without loading all transactions.

    Returns: {"income": float, "expense": float, "net": float}
    """
    sql = """
        SELECT type, SUM(amount_eur) as total
        FROM transactions
        WHERE year = ? AND month = ? AND COALESCE(sub_type, '') != 'TRANSFER'
        GROUP BY type
    """
    with get_conn() as conn:
        rows = conn.execute(sql, (year, month)).fetchall()
    income = 0.0
    expense = 0.0
    for row in rows:
        if row[0] == "INCOME":
            income = float(row[1] or 0)
        elif row[0] == "EXPENSE":
            expense = float(row[1] or 0)
    return {"income": income, "expense": expense, "net": income - expense}


def get_filtered_transactions(
    date_from: str | None = None,
    date_to: str | None = None,
    tx_type: str | None = None,
    include_transfers: bool = False,
    user_email: str | None = None,
) -> pd.DataFrame:
    """Fetch transactions with SQL-level date/type filtering."""
    clauses = []
    params: list = []
    if not include_transfers:
        clauses.append("COALESCE(sub_type,'') != 'TRANSFER'")
    if date_from:
        clauses.append("date >= ?")
        params.append(date_from.isoformat() if isinstance(date_from, date) else date_from)
    if date_to:
        clauses.append("date <= ?")
        params.append(date_to.isoformat() if isinstance(date_to, date) else date_to)
    if tx_type:
        clauses.append("type = ?")
        params.append(tx_type)
    if user_email:
        pass  # per-user DB: all data belongs to current user
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT * FROM transactions{where} ORDER BY date"
    with get_conn() as conn:
        df = read_sql(sql, conn, params)
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d", errors="coerce")
    return df


def add_transaction(
    date: str,
    tx_type: str,
    account: str,
    category: str,
    amount_original: float,
    currency_original: str,
    amount_eur: float,
    nbu_rate: float,
    description: str = "",
    external_id: str | None = None,
    source: str = "manual",
) -> int:
    if amount_original is not None and amount_original <= 0:
        raise ValueError("amount must be positive")
    if amount_eur is not None and amount_eur <= 0:
        raise ValueError("amount_eur must be positive")
    if currency_original and currency_original not in ("EUR", "UAH", "USD", "PLN", "GBP", "CZK"):
        raise ValueError(f"invalid currency: {currency_original}")
    dt = pd.to_datetime(date)
    sub_type = "INCOME" if tx_type == "INCOME" else "EXPENSE_PERSONAL"
    owner = _derive_owner(account)
    sql = """
        INSERT INTO transactions
        (date, year, month, type, sub_type, account, category,
         amount_original, currency_original, amount_eur, nbu_rate_eur_used, description, owner,
         external_id, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    with get_conn() as conn:
        cur = conn.execute(
            sql,
            (
                dt.strftime("%Y-%m-%d"),
                dt.year,
                dt.month,
                tx_type,
                sub_type,
                account,
                category,
                amount_original,
                currency_original,
                amount_eur,
                nbu_rate,
                description,
                owner,
                external_id,
                source,
            ),
        )
        lastrowid = cur.lastrowid

    return lastrowid


def get_owners() -> list[str]:
    """Return distinct owner names from transactions."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT owner FROM transactions WHERE owner IS NOT NULL ORDER BY owner"
        ).fetchall()
    return [r[0] for r in rows]


def get_categories() -> list[str]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT category FROM transactions "
            "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' "
            "ORDER BY category"
        ).fetchall()
    return [r[0] for r in rows if r[0]]


def get_years() -> list[int]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT year FROM transactions WHERE year IS NOT NULL ORDER BY year"
        ).fetchall()
    return [int(r[0]) for r in rows]


def delete_transaction(tx_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))



def update_transaction(tx_id: int, **fields):
    """Update specific fields of a transaction by ID.

    Accepted fields: date, category, amount_eur, description, account, type, sub_type.
    """
    allowed = {"date", "category", "amount_eur", "description", "account", "type", "sub_type",
                "currency_original", "amount_original", "nbu_rate_eur_used"}
    # Allow description="" (empty string) — use sentinel to distinguish from missing
    _MISSING = object()
    updates = {}
    for k, v in fields.items():
        if k not in allowed:
            continue
        if v is None and k != "description":
            continue
        updates[k] = v if v is not None else ""
    if not updates:
        return
    # Derive year/month if date changes
    if "date" in updates:
        from datetime import date as _date_cls
        d = updates["date"]
        if isinstance(d, str):
            d = _date_cls.fromisoformat(d)
        updates["year"] = d.year
        updates["month"] = d.month
        updates["date"] = d.isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [tx_id]
    with get_conn() as conn:
        conn.execute(f"UPDATE transactions SET {set_clause} WHERE id = ?", values)



def get_account_balances() -> dict:
    """Compute running balance per account from all transactions + initial balances."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT account, type, SUM(amount_eur) as total "
            "FROM transactions WHERE account IS NOT NULL AND account != '' "
            "GROUP BY account, type"
        ).fetchall()
        # Get initial balances from custom_accounts in same connection
        _cols = _get_table_columns(conn, "custom_accounts")
        _init_rows = (
            conn.execute(
                "SELECT name, initial_balance, currency FROM custom_accounts WHERE initial_balance != 0"
            ).fetchall()
            if "initial_balance" in _cols else []
        )
    balances: dict = {}
    # Add initial balances (EUR accounts only — UAH handled in get_uah_balances)
    for acc_name, init_bal, cur in _init_rows:
        if cur != "₴":
            balances[acc_name] = init_bal or 0.0
    for account, tx_type, total in rows:
        if account not in balances:
            balances[account] = 0.0
        if tx_type == "INCOME":
            balances[account] += total or 0
        elif tx_type == "EXPENSE":
            balances[account] -= total or 0
    return balances


def get_recent_transactions(limit: int = 200, since_date: str | None = None,
                            include_transfers: bool = False, user_email: str | None = None,
                            search: str | None = None) -> pd.DataFrame:
    clauses = ["1=1"]
    params: list = []
    if not include_transfers:
        clauses.append("COALESCE(sub_type,'') != 'TRANSFER'")
    if since_date:
        clauses.append("date >= ?")
        params.append(since_date.isoformat() if isinstance(since_date, date) else since_date)
    if search:
        clauses.append("(category LIKE ? OR description LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if user_email:
        pass  # per-user DB: all data belongs to current user
    where = " WHERE " + " AND ".join(clauses)
    params.append(limit)
    sql = f"SELECT * FROM transactions{where} ORDER BY date DESC, id DESC LIMIT ?"
    with get_conn() as conn:
        df = read_sql(sql, conn, params)
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d", errors="coerce")
    return df


def get_uah_balances() -> dict[str, float]:
    """Return UAH balance (sum of UAH transactions + initial balance) per account."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT account,
                SUM(CASE WHEN type='INCOME' THEN amount_original ELSE -amount_original END)
            FROM transactions
            WHERE currency_original='₴' AND type IN ('INCOME','EXPENSE')
            GROUP BY account
        """).fetchall()
        # Get initial balances for UAH accounts
        _cols = _get_table_columns(conn, "custom_accounts")
        if "initial_balance" in _cols:
            _init_rows = conn.execute(
                "SELECT name, initial_balance FROM custom_accounts WHERE currency='₴' AND initial_balance != 0"
            ).fetchall()
        else:
            _init_rows = []
    result: dict[str, float] = {}
    for acc_name, init_bal in _init_rows:
        result[acc_name] = init_bal or 0.0
    for r in rows:
        acc = r[0]
        if acc in result:
            result[acc] += r[1] or 0.0
        else:
            result[acc] = r[1] or 0.0
    return result


def get_accounts() -> list[str]:
    """Return distinct account names used in transactions."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT account FROM transactions "
            "WHERE account IS NOT NULL AND account != '' ORDER BY account"
        ).fetchall()
    return [r[0] for r in rows]


def add_transfer(
    date_str: str,
    from_account: str,
    to_account: str,
    from_amount: float,
    to_amount: float,
    from_currency: str,
    to_currency: str,
    from_eur: float,
    to_eur: float,
    nbu_rate: float,
    description: str = "",
) -> tuple[int, int]:
    """Create a transfer: EXPENSE from source account, INCOME to destination. Returns (from_id, to_id)."""
    dt = pd.to_datetime(date_str)
    with get_conn() as conn:
        cur1 = conn.execute("""
            INSERT INTO transactions
            (date, year, month, type, sub_type, account, category,
             amount_original, currency_original, amount_eur, nbu_rate_eur_used, description)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (date_str, int(dt.year), int(dt.month),
              "EXPENSE", "TRANSFER", from_account, f"Transfer → {to_account}",
              from_amount, from_currency, from_eur, nbu_rate, description))
        cur2 = conn.execute("""
            INSERT INTO transactions
            (date, year, month, type, sub_type, account, category,
             amount_original, currency_original, amount_eur, nbu_rate_eur_used, description)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (date_str, int(dt.year), int(dt.month),
              "INCOME", "TRANSFER", to_account, f"Transfer ← {from_account}",
              to_amount, to_currency, to_eur, nbu_rate, description))
        result = cur1.lastrowid, cur2.lastrowid

    return result


# ─── Category favourites & custom categories ──────────────────────────────────

def get_favourites() -> set[str]:
    with get_conn() as conn:
        conn.execute(CREATE_FAVOURITES_SQL)
        rows = conn.execute("SELECT category FROM category_favourites").fetchall()
    return {r[0] for r in rows}


def toggle_favourite(category: str) -> bool:
    """Toggle favourite. Returns True if now favourite, False if removed."""
    with get_conn() as conn:
        conn.execute(CREATE_FAVOURITES_SQL)
        existing = conn.execute(
            "SELECT 1 FROM category_favourites WHERE category=?", (category,)
        ).fetchone()
        if existing:
            conn.execute("DELETE FROM category_favourites WHERE category=?", (category,))
            result = False
        else:
            conn.execute("INSERT OR IGNORE INTO category_favourites (category) VALUES (?)", (category,))
            result = True

    return result


def add_custom_category(category: str):
    with get_conn() as conn:
        conn.execute(CREATE_CUSTOM_CATEGORIES_SQL)
        conn.execute("INSERT OR IGNORE INTO custom_categories (category) VALUES (?)", (category,))



def delete_custom_category(category: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM custom_categories WHERE category=?", (category,))


def rename_category(old_name: str, new_name: str) -> bool:
    """Rename a category everywhere: custom_categories, transactions, budgets,
    recurring_transactions, and category_favourites.
    Returns False if new_name already exists (to prevent accidental merge)."""
    with get_conn() as conn:
        conn.execute(CREATE_CUSTOM_CATEGORIES_SQL)
        # Check if target name already exists in custom_categories or transactions
        existing = conn.execute(
            "SELECT 1 FROM custom_categories WHERE category=? AND category != ?",
            (new_name, old_name)
        ).fetchone()
        if existing:
            return False
        conn.execute("UPDATE custom_categories SET category=? WHERE category=?", (new_name, old_name))
        # Also insert into custom_categories if renaming a built-in category
        conn.execute(
            "INSERT INTO custom_categories (category) VALUES (?) ON CONFLICT DO NOTHING",
            (new_name,)
        )
        conn.execute("UPDATE transactions SET category=? WHERE category=?", (new_name, old_name))
        conn.execute("UPDATE budgets SET category=? WHERE category=?", (new_name, old_name))
        conn.execute("UPDATE recurring_transactions SET category=? WHERE category=?", (new_name, old_name))
        conn.execute(CREATE_FAVOURITES_SQL)
        conn.execute("UPDATE category_favourites SET category=? WHERE category=?", (new_name, old_name))
        return True


def delete_category_and_reassign(cat_name: str, target_cat: str):
    """Move all transactions from cat_name to target_cat, then delete the category."""
    with get_conn() as conn:
        conn.execute("UPDATE transactions SET category=? WHERE category=?", (target_cat, cat_name))
        conn.execute("UPDATE budgets SET category=? WHERE category=?", (target_cat, cat_name))
        conn.execute("UPDATE recurring_transactions SET category=? WHERE category=?", (target_cat, cat_name))
        conn.execute(CREATE_CUSTOM_CATEGORIES_SQL)
        conn.execute("DELETE FROM custom_categories WHERE category=?", (cat_name,))
        conn.execute(CREATE_FAVOURITES_SQL)
        conn.execute("DELETE FROM category_favourites WHERE category=?", (cat_name,))


def get_category_frequency() -> list[dict]:
    """Return category usage stats: name, transaction count, last used date.

    Sorted by count descending. Only categories with >= 1 transaction.
    """
    sql = """
        SELECT category,
               COUNT(*) AS tx_count,
               MAX(date) AS last_used
        FROM transactions
        WHERE category IS NOT NULL AND category != ''
        GROUP BY category
        ORDER BY tx_count DESC
    """
    with get_conn() as conn:
        rows = conn.execute(sql).fetchall()
    return [{"category": r[0], "count": r[1], "last_used": r[2]} for r in rows]


def migrate_categories():
    """Apply CATEGORY_MIGRATION to normalize all existing category values in the DB."""
    with get_conn() as conn:
        for old, new in CATEGORY_MIGRATION.items():
            conn.execute(
                "UPDATE transactions SET category=? WHERE category=?", (new, old)
            )
            conn.execute(
                "UPDATE budgets SET category=? WHERE category=?", (new, old)
            )
            conn.execute(
                "UPDATE recurring_transactions SET category=? WHERE category=?", (new, old)
            )
            conn.execute(
                "UPDATE custom_categories SET category=? WHERE category=?", (new, old)
            )
            conn.execute(
                "UPDATE category_favourites SET category=? WHERE category=?", (new, old)
            )


# ─── Daily Log ────────────────────────────────────────────────────────────────

def get_all_daily_logs(user_email: str | None = None, days: int | None = None) -> pd.DataFrame:
    sql = "SELECT * FROM daily_log"
    params: list = []
    conditions: list[str] = []
    if user_email:
        conditions.append("user_email = ?")
        params.append(user_email)
    if days:
        from datetime import date as _d, timedelta as _td
        conditions.append("date >= ?")
        params.append((_d.today() - _td(days=days)).isoformat())
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY date"
    with get_conn() as conn:
        df = read_sql(sql, conn, params)
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    return df


def get_daily_log_by_date(date: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM daily_log WHERE date = ?", (date,)
        ).fetchone()
    if row is None:
        return None
    cols = ["id", "date", "level", "mood_delta", "sex_count", "sex_note",
            "bj_count", "bj_note", "kids_hours", "kids_note", "general_note",
            "energy_level", "stress_level", "focus_quality", "alcohol", "caffeine",
            "created_at"]
    return dict(zip(cols, row))


def upsert_daily_log(
    date: str,
    mood_delta: int,
    sex_count: int,
    sex_note: str,
    bj_count: int,
    bj_note: str,
    kids_hours: float,
    kids_note: str,
    general_note: str,
    energy_level: int | None = None,
    stress_level: int | None = None,
    focus_quality: int | None = None,
    alcohol: int | None = None,
    caffeine: int | None = None,
) -> float:
    """Insert or update a daily log entry. Returns the new level value."""
    date_str = pd.to_datetime(date).strftime("%Y-%m-%d")

    with get_conn() as conn:
        # Get previous level (from the most recent log before this date)
        prev = conn.execute(
            "SELECT level FROM daily_log WHERE date < ? ORDER BY date DESC LIMIT 1",
            (date_str,)
        ).fetchone()
        prev_level = prev[0] if prev and prev[0] is not None else 0.0

        # Compute new level: delta * 0.2 (mood scale -5..+5)
        new_level = round(prev_level + mood_delta * 0.2, 2)
        new_level = max(-5.0, min(5.0, new_level))

        existing = conn.execute(
            "SELECT id FROM daily_log WHERE date = ?", (date_str,)
        ).fetchone()

        if existing:
            conn.execute("""
                UPDATE daily_log SET
                    level=?, mood_delta=?, sex_count=?, sex_note=?,
                    bj_count=?, bj_note=?, kids_hours=?, kids_note=?, general_note=?,
                    energy_level=?, stress_level=?, focus_quality=?, alcohol=?, caffeine=?
                WHERE date=?
            """, (new_level, mood_delta, sex_count or None, sex_note or None,
                  bj_count or None, bj_note or None,
                  kids_hours if kids_hours else None, kids_note or None,
                  general_note or None,
                  energy_level or None, stress_level or None, focus_quality or None,
                  alcohol or None, caffeine or None, date_str))
        else:
            conn.execute("""
                INSERT INTO daily_log
                (date, level, mood_delta, sex_count, sex_note, bj_count, bj_note,
                 kids_hours, kids_note, general_note,
                 energy_level, stress_level, focus_quality, alcohol, caffeine)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (date_str, new_level, mood_delta, sex_count or None, sex_note or None,
                  bj_count or None, bj_note or None,
                  kids_hours if kids_hours else None, kids_note or None,
                  general_note or None,
                  energy_level or None, stress_level or None, focus_quality or None,
                  alcohol or None, caffeine or None))


    return new_level


def remove_future_transactions() -> int:
    """Delete all transactions whose date is in the future. Returns count deleted."""
    today = date.today().isoformat()
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM transactions WHERE date > ?", (today,))
        count = cur.rowcount

    return count


def remove_future_daily_logs() -> int:
    """Delete all daily_log entries whose date is in the future. Returns count deleted."""
    today = date.today().isoformat()
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM daily_log WHERE date > ?", (today,))
        count = cur.rowcount

    return count


def bulk_import_daily_logs(rows: list[dict]):
    """Import multiple daily log rows (from CSV). Skips duplicates."""
    with get_conn() as conn:
        for row in rows:
            existing = conn.execute(
                "SELECT id FROM daily_log WHERE date = ?", (row["date"],)
            ).fetchone()
            if not existing:
                conn.execute("""
                    INSERT INTO daily_log (date, level, sex_count, bj_count)
                    VALUES (?, ?, ?, ?)
                """, (row["date"], row.get("level"), row.get("sex_count"), row.get("bj_count")))



# ─── AI Notes ─────────────────────────────────────────────────────────────────

def get_ai_note(section: str) -> dict | None:
    """Get AI note for a section. Returns dict {section, note, prompt, generated_at} or None."""
    with get_conn() as conn:
        conn.execute(CREATE_AI_NOTES_SQL)
        row = conn.execute(
            "SELECT section, note, prompt, generated_at FROM ai_notes WHERE section=?",
            (section,),
        ).fetchone()
    if row:
        return {"section": row[0], "note": row[1], "prompt": row[2], "generated_at": row[3]}
    return None


def set_ai_note(section: str, note: str, prompt: str = ""):
    """Insert or update AI note for a section."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(CREATE_AI_NOTES_SQL)
        conn.execute(
            """INSERT INTO ai_notes (section, note, prompt, generated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(section)
               DO UPDATE SET note=excluded.note, prompt=excluded.prompt, generated_at=excluded.generated_at""",
            (section, note, prompt, now),
        )


def get_ai_note_prompt(section: str) -> str:
    """Get custom prompt for a section. Returns '' if not set."""
    note = get_ai_note(section)
    return note["prompt"] if note else ""


def set_ai_note_prompt(section: str, prompt: str):
    """Set custom prompt for a section (preserves existing note)."""
    existing = get_ai_note(section)
    if existing:
        with get_conn() as conn:
            conn.execute(
                "UPDATE ai_notes SET prompt=? WHERE section=?",
                (prompt, section),
            )
    else:
        # No note yet — store prompt with empty note for later generation
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        with get_conn() as conn:
            conn.execute(CREATE_AI_NOTES_SQL)
            conn.execute(
                """INSERT INTO ai_notes (section, note, prompt, generated_at)
                   VALUES (?, '', ?, ?)""",
                (section, prompt, now),
            )


def get_all_ai_notes() -> list[dict]:
    """Get all AI notes (for batch regeneration)."""
    with get_conn() as conn:
        conn.execute(CREATE_AI_NOTES_SQL)
        rows = conn.execute(
            "SELECT section, note, prompt, generated_at FROM ai_notes"
        ).fetchall()
    return [
        {"section": r[0], "note": r[1], "prompt": r[2], "generated_at": r[3]}
        for r in rows
    ]


# ─── AI Context Snapshots ──────────────────────────────────────────────────────

def upsert_snapshot(period_type: str, period_key: str, domain: str, content: str):
    """Insert or update an AI context snapshot."""
    with get_conn() as conn:
        conn.execute(CREATE_AI_CONTEXT_SNAPSHOTS_SQL)
        conn.execute(
            """INSERT INTO ai_context_snapshots (period_type, period_key, domain, content, generated_at)
               VALUES (?, ?, ?, ?, datetime('now'))
               ON CONFLICT (period_type, period_key, domain)
               DO UPDATE SET content = excluded.content, generated_at = excluded.generated_at""",
            (period_type, period_key, domain, content),
        )


def get_snapshot(period_type: str, period_key: str, domain: str = "all") -> str | None:
    """Get a snapshot's content."""
    with get_conn() as conn:
        conn.execute(CREATE_AI_CONTEXT_SNAPSHOTS_SQL)
        row = conn.execute(
            "SELECT content FROM ai_context_snapshots WHERE period_type=? AND period_key=? AND domain=?",
            (period_type, period_key, domain),
        ).fetchone()
    return row[0] if row else None


def get_all_snapshots() -> list[dict]:
    """Get all snapshots for listing."""
    with get_conn() as conn:
        conn.execute(CREATE_AI_CONTEXT_SNAPSHOTS_SQL)
        rows = conn.execute(
            "SELECT period_type, period_key, domain, generated_at FROM ai_context_snapshots ORDER BY period_key DESC"
        ).fetchall()
    return [{"period_type": r[0], "period_key": r[1], "domain": r[2], "generated_at": r[3]} for r in rows]


# ─── Shopping list ─────────────────────────────────────────────────────────────

def get_shopping_items(include_bought: bool = False) -> list[dict]:
    """Get shopping items. By default only active (not bought) items."""
    with get_conn() as conn:
        conn.execute(CREATE_SHOPPING_ITEMS_SQL)
        if include_bought:
            rows = conn.execute(
                "SELECT id, item_name, quantity, added_by, added_at, bought_at, bought_by "
                "FROM shopping_items ORDER BY id"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, item_name, quantity, added_by, added_at, bought_at, bought_by "
                "FROM shopping_items WHERE bought_at IS NULL ORDER BY id"
            ).fetchall()
    return [
        {"id": r[0], "item_name": r[1], "quantity": r[2], "added_by": r[3],
         "added_at": r[4], "bought_at": r[5], "bought_by": r[6]}
        for r in rows
    ]


def add_shopping_item(item_name: str, quantity: str = "1", added_by: str = "app") -> int:
    """Add a single item to the shopping list. Returns new item id."""
    with get_conn() as conn:
        conn.execute(CREATE_SHOPPING_ITEMS_SQL)
        cur = conn.execute(
            "INSERT INTO shopping_items (item_name, quantity, added_by) VALUES (?, ?, ?)",
            (item_name.strip(), quantity.strip(), added_by),
        )
        lastrowid = cur.lastrowid

    return lastrowid


def add_shopping_items_bulk(items: list[dict], added_by: str = "telegram") -> int:
    """Add multiple items. Each dict: {name, quantity?}. Returns count added."""
    count = 0
    with get_conn() as conn:
        conn.execute(CREATE_SHOPPING_ITEMS_SQL)
        for item in items:
            name = item.get("name", "").strip()
            if not name:
                continue
            qty = str(item.get("quantity", "1")).strip() or "1"
            conn.execute(
                "INSERT INTO shopping_items (item_name, quantity, added_by) VALUES (?, ?, ?)",
                (name, qty, added_by),
            )
            count += 1

    return count


def mark_item_bought(item_id: int, bought_by: str = "app"):
    """Mark shopping item as bought and copy to history."""
    from datetime import datetime
    now = datetime.now().isoformat(timespec="seconds")
    today = date.today().isoformat()
    with get_conn() as conn:
        conn.execute(CREATE_SHOPPING_ITEMS_SQL)
        conn.execute(CREATE_SHOPPING_HISTORY_SQL)
        row = conn.execute(
            "SELECT item_name, quantity FROM shopping_items WHERE id = ?", (item_id,)
        ).fetchone()
        if not row:
            return
        conn.execute(
            "UPDATE shopping_items SET bought_at = ?, bought_by = ? WHERE id = ?",
            (now, bought_by, item_id),
        )
        conn.execute(
            "INSERT INTO shopping_history (item_name, quantity, bought_date, bought_by) VALUES (?, ?, ?, ?)",
            (row[0], row[1], today, bought_by),
        )



def mark_items_bought_bulk(item_ids: list[int], bought_by: str = "app"):
    """Mark multiple shopping items as bought and copy to history in a single transaction."""
    if not item_ids:
        return
    from datetime import datetime
    now = datetime.now().isoformat(timespec="seconds")
    today = date.today().isoformat()
    placeholders = ",".join("?" for _ in item_ids)
    with get_conn() as conn:
        conn.execute(CREATE_SHOPPING_ITEMS_SQL)
        conn.execute(CREATE_SHOPPING_HISTORY_SQL)
        rows = conn.execute(
            f"SELECT id, item_name, quantity FROM shopping_items WHERE id IN ({placeholders})",
            item_ids,
        ).fetchall()
        if not rows:
            return
        conn.execute(
            f"UPDATE shopping_items SET bought_at = ?, bought_by = ? WHERE id IN ({placeholders})",
            [now, bought_by] + item_ids,
        )
        conn.executemany(
            "INSERT INTO shopping_history (item_name, quantity, bought_date, bought_by) VALUES (?, ?, ?, ?)",
            [(r[1], r[2], today, bought_by) for r in rows],
        )


def unmark_item_bought(item_id: int):
    """Unmark item as bought (undo)."""
    with get_conn() as conn:
        conn.execute(
            "UPDATE shopping_items SET bought_at = NULL, bought_by = NULL WHERE id = ?",
            (item_id,),
        )



def delete_shopping_item(item_id: int):
    """Delete a shopping item permanently."""
    with get_conn() as conn:
        conn.execute("DELETE FROM shopping_items WHERE id = ?", (item_id,))



def clear_bought_items():
    """Remove all bought items from the active list."""
    with get_conn() as conn:
        conn.execute("DELETE FROM shopping_items WHERE bought_at IS NOT NULL")



def get_shopping_history(date_str: str | None = None) -> list[dict]:
    """Get shopping history, optionally filtered by date."""
    with get_conn() as conn:
        conn.execute(CREATE_SHOPPING_HISTORY_SQL)
        if date_str:
            rows = conn.execute(
                "SELECT id, item_name, quantity, bought_date, bought_by "
                "FROM shopping_history WHERE bought_date = ? ORDER BY id DESC",
                (date_str,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, item_name, quantity, bought_date, bought_by "
                "FROM shopping_history ORDER BY bought_date DESC, id DESC LIMIT 200"
            ).fetchall()
    return [
        {"id": r[0], "item_name": r[1], "quantity": r[2], "bought_date": r[3], "bought_by": r[4]}
        for r in rows
    ]


def get_shopping_stats(from_date: str, to_date: str) -> list[dict]:
    """Get shopping item frequency stats for a date range.

    Returns list of {item_name, count, last_bought} sorted by count desc.
    """
    _from = from_date.isoformat() if isinstance(from_date, date) else from_date
    _to = to_date.isoformat() if isinstance(to_date, date) else to_date
    with get_conn() as conn:
        conn.execute(CREATE_SHOPPING_HISTORY_SQL)
        rows = conn.execute(
            "SELECT LOWER(item_name) as item_name, COUNT(*) as cnt, MAX(bought_date) as last_bought "
            "FROM shopping_history "
            "WHERE bought_date BETWEEN ? AND ? "
            "GROUP BY LOWER(item_name) "
            "ORDER BY cnt DESC, last_bought DESC",
            (_from, _to),
        ).fetchall()
    return [{"item_name": r[0], "count": r[1], "last_bought": r[2]} for r in rows]


# ─── Food tracking CRUD ───────────────────────────────────────────────────────

def add_food_entry(
    date_str: str,
    time_str: str,
    description: str,
    calories: float,
    protein_g: float,
    fat_g: float,
    carbs_g: float,
    weight_g: float | None = None,
    source: str = "text",
    photo_file_id: str | None = None,
    ai_raw_response: str | None = None,
    user_id: str | None = None,
) -> int:
    """Add a food entry. Returns new entry id."""
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO food_log (user_id, date, time, description, weight_g, "
            "calories, protein_g, fat_g, carbs_g, source, photo_file_id, ai_raw_response) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (user_id, date_str, time_str, description, weight_g,
             calories, protein_g, fat_g, carbs_g, source, photo_file_id, ai_raw_response),
        )
        return cur.lastrowid


def get_food_log_for_date(date_str: str, user_id: str | None = None) -> list[dict]:
    """Get all food entries for a given date, sorted by time."""
    _sql = ("SELECT id, time, description, weight_g, calories, protein_g, fat_g, carbs_g, source "
            "FROM food_log WHERE date=?")
    _params: list = [date_str]
    if user_id:
        _sql += " AND user_id=?"
        _params.append(user_id)
    _sql += " ORDER BY time"
    with get_conn() as conn:
        rows = conn.execute(_sql, _params).fetchall()
    return [
        {"id": r[0], "time": r[1], "description": r[2], "weight_g": r[3],
         "calories": r[4], "protein_g": r[5], "fat_g": r[6], "carbs_g": r[7], "source": r[8]}
        for r in rows
    ]


def get_food_summary_for_date(date_str: str, user_id: str | None = None) -> dict:
    """Get aggregated KBJU for a given date."""
    _sql = ("SELECT COALESCE(SUM(calories),0), COALESCE(SUM(protein_g),0), "
            "COALESCE(SUM(fat_g),0), COALESCE(SUM(carbs_g),0) "
            "FROM food_log WHERE date=?")
    _params: list = [date_str]
    if user_id:
        _sql += " AND user_id=?"
        _params.append(user_id)
    with get_conn() as conn:
        row = conn.execute(_sql, _params).fetchone()
    return {"calories": row[0], "protein_g": row[1], "fat_g": row[2], "carbs_g": row[3]}


def delete_food_entry(entry_id: int):
    """Delete a food log entry."""
    with get_conn() as conn:
        conn.execute("DELETE FROM food_log WHERE id=?", (entry_id,))


def get_food_calories_timeseries(days: int = 30, user_id: str | None = None) -> pd.DataFrame:
    """Get daily calorie totals for last N days."""
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        if user_id:
            df = read_sql(
                "SELECT date, SUM(calories) as calories, SUM(protein_g) as protein_g, "
                "SUM(fat_g) as fat_g, SUM(carbs_g) as carbs_g "
                "FROM food_log WHERE date>=? AND user_id=? GROUP BY date ORDER BY date",
                conn, [since, user_id],
            )
        else:
            df = read_sql(
                "SELECT date, SUM(calories) as calories, SUM(protein_g) as protein_g, "
                "SUM(fat_g) as fat_g, SUM(carbs_g) as carbs_g "
                "FROM food_log WHERE date>=? GROUP BY date ORDER BY date",
                conn, [since],
            )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d", errors="coerce")
    return df


def get_food_last_entry(user_id: str | None = None) -> dict | None:
    """Get most recent food entry."""
    with get_conn() as conn:
        if user_id:
            row = conn.execute(
                "SELECT id, date, time, description, calories FROM food_log "
                "WHERE user_id=? ORDER BY date DESC, time DESC LIMIT 1",
                (user_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT id, date, time, description, calories FROM food_log "
                "ORDER BY date DESC, time DESC LIMIT 1"
            ).fetchone()
    if row:
        return {"id": row[0], "date": row[1], "time": row[2], "description": row[3], "calories": row[4]}
    return None


# ─── Export all data ─────────────────────────────────────────────────────────

def export_user_data_csv(email: str) -> dict[str, str]:
    """Export all user data as dict of table_name -> CSV string."""
    import csv, io
    from .core import set_current_user
    set_current_user(email)
    tables = ["transactions", "daily_log", "food_log", "shopping_items",
              "garmin_daily", "garmin_activities", "garmin_sleep",
              "withings_measurements", "budgets", "savings_goals"]
    result = {}
    with get_conn() as conn:
        for tbl in tables:
            try:
                cur = conn.execute(f"SELECT * FROM {tbl}")
                if cur.description is None:
                    continue
                cols = [d[0] for d in cur.description]
                rows = cur.fetchall()
                if not rows:
                    continue
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(cols)
                writer.writerows(rows)
                result[tbl] = buf.getvalue()
            except Exception:
                pass
    return result
