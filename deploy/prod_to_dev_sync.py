"""Prod-to-dev incremental data replication.

Copies NEW rows from prod (DATABASE_URL) to dev (DATABASE_DEV_URL)
using INSERT ... ON CONFLICT DO NOTHING — prod data is NEVER modified.

Tables are synced in dependency order (parents before children).
"""

import logging
import os

import psycopg2
import psycopg2.extras

logger = logging.getLogger("prod_to_dev_sync")

# ---------------------------------------------------------------------------
# Tables to sync, in dependency order.
# Each entry: (table_name, primary_key_columns, order_column)
#   - primary_key_columns: used for ON CONFLICT (...) DO NOTHING
#   - order_column: used for incremental fetch (ORDER BY ... DESC LIMIT)
# ---------------------------------------------------------------------------

SYNC_TABLES: list[tuple[str, list[str], str]] = [
    # Auth & core
    ("users",                    ["id"],                             "id"),
    ("guest_invites",            ["email"],                          "email"),
    ("user_preferences",         ["user_id", "key"],                 "user_id"),
    ("secrets",                  ["id"],                             "id"),
    ("telegram_links",           ["telegram_id"],                    "telegram_id"),
    ("telegram_connect_codes",   ["code"],                           "code"),
    ("audit_log",                ["id"],                             "id"),

    # Finance
    ("transactions",             ["id"],                             "id"),
    ("nbu_rates",                ["date", "currency_code"],          "date"),
    ("custom_accounts",          ["id"],                             "id"),
    ("category_favourites",      ["category"],                       "category"),
    ("custom_categories",        ["category"],                       "category"),
    ("budgets",                  ["id"],                             "id"),
    ("budget_config",            ["id"],                             "id"),
    ("mandatory_categories",     ["id"],                             "id"),
    ("recurring_transactions",   ["id"],                             "id"),
    ("savings_goals",            ["id"],                             "id"),

    # Daily log & lifestyle
    ("daily_log",                ["id"],                             "id"),
    ("food_log",                 ["id"],                             "id"),
    ("shopping_items",           ["id"],                             "id"),
    ("shopping_history",         ["id"],                             "id"),

    # Garmin
    ("garmin_daily",             ["date"],                           "date"),
    ("garmin_activities",        ["activity_id"],                    "activity_id"),
    ("garmin_sleep",             ["date"],                           "date"),
    ("garmin_heart_rate",        ["date", "timestamp"],              "date"),
    ("garmin_body_composition",  ["date"],                           "date"),
    ("garmin_staging",           ["id"],                             "id"),

    # Withings
    ("withings_measurements",    ["date"],                           "date"),

    # AI
    ("ai_notes",                 ["id"],                             "id"),
    ("ai_context_snapshots",     ["id"],                             "id"),
    ("chat_history",             ["id"],                             "id"),

    # Gym (parent → child order)
    ("gym_exercises",            ["id"],                             "id"),
    ("gym_workouts",             ["id"],                             "id"),
    ("gym_workout_exercises",    ["id"],                             "id"),
    ("gym_sets",                 ["id"],                             "id"),
    ("gym_programs",             ["id"],                             "id"),
    ("gym_program_days",         ["id"],                             "id"),
    ("gym_program_exercises",    ["id"],                             "id"),

    # Sync failures
    ("sync_failures",            ["id"],                             "id"),

    # Tax
    ("tax_declarations",         ["id"],                             "id"),
    ("tax_declaration_items",    ["id"],                             "id"),
    ("tax_receipts",             ["id"],                             "id"),
    ("tax_income_records",       ["id"],                             "id"),
    ("tax_deadlines",            ["id"],                             "id"),
    ("tax_documents",            ["id"],                             "id"),
    ("tax_simulations",          ["id"],                             "id"),

    # Investments & trading
    ("broker_positions",         ["id"],                             "id"),
    ("broker_account_summaries", ["id"],                             "id"),
    ("broker_transactions",      ["id"],                             "id"),
    ("trading_strategies",       ["id"],                             "id"),
]

BATCH_SIZE = 500


def _get_columns(cur, table: str) -> list[str]:
    """Get column names for a table."""
    cur.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = %s AND table_schema = 'public' "
        "ORDER BY ordinal_position",
        (table,),
    )
    return [row[0] for row in cur.fetchall()]


def _sync_table(
    prod_conn,
    dev_conn,
    table: str,
    pk_cols: list[str],
    order_col: str,
) -> int:
    """Copy new rows from prod to dev for a single table.

    Uses INSERT ... ON CONFLICT (pk) DO NOTHING so existing dev rows
    are never overwritten and prod is only read (SELECT), never modified.
    """
    with prod_conn.cursor() as pcur:
        columns = _get_columns(pcur, table)
        if not columns:
            logger.warning("Table %s not found in prod, skipping.", table)
            return 0

    col_list = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join(["%s"] * len(columns))
    conflict_cols = ", ".join(f'"{c}"' for c in pk_cols)

    insert_sql = (
        f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) '
        f"ON CONFLICT ({conflict_cols}) DO NOTHING"
    )

    total_inserted = 0
    offset = 0

    while True:
        # Read batch from prod (read-only)
        with prod_conn.cursor() as pcur:
            pcur.execute(
                f'SELECT {col_list} FROM "{table}" '
                f'ORDER BY "{order_col}" '
                f"LIMIT %s OFFSET %s",
                (BATCH_SIZE, offset),
            )
            rows = pcur.fetchall()

        if not rows:
            break

        # Write batch to dev
        with dev_conn.cursor() as dcur:
            psycopg2.extras.execute_batch(dcur, insert_sql, rows, page_size=100)
        dev_conn.commit()

        total_inserted += len(rows)
        offset += BATCH_SIZE

        if len(rows) < BATCH_SIZE:
            break

    return total_inserted


def run_sync() -> dict:
    """Run incremental prod→dev sync for all tables.

    Returns dict with keys: tables, rows, errors.
    """
    prod_url = os.environ["DATABASE_URL"]
    dev_url = os.environ.get("DATABASE_DEV_URL")
    if not dev_url:
        raise RuntimeError("DATABASE_DEV_URL env var is not set")

    prod_conn = psycopg2.connect(prod_url)
    dev_conn = psycopg2.connect(dev_url)

    # Prod connection is read-only: set to autocommit + read-only transaction
    prod_conn.set_session(readonly=True, autocommit=True)

    stats = {"tables": 0, "rows": 0, "errors": 0}

    try:
        for table, pk_cols, order_col in SYNC_TABLES:
            try:
                inserted = _sync_table(prod_conn, dev_conn, table, pk_cols, order_col)
                stats["tables"] += 1
                stats["rows"] += inserted
                if inserted > 0:
                    logger.info("  %s: %d rows copied", table, inserted)
            except Exception as e:
                stats["errors"] += 1
                dev_conn.rollback()
                logger.error("  %s: FAILED — %s", table, e)
    finally:
        prod_conn.close()
        dev_conn.close()

    # Reset sequences on dev so new inserts get correct IDs
    if stats["rows"] > 0:
        _reset_sequences(os.environ.get("DATABASE_DEV_URL"))

    return stats


def _reset_sequences(dev_url: str):
    """Reset auto-increment sequences on dev to match max(id)."""
    try:
        conn = psycopg2.connect(dev_url)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.relname AS seq_name,
                       t.relname AS table_name,
                       a.attname AS column_name
                FROM pg_class s
                JOIN pg_depend d ON d.objid = s.oid
                JOIN pg_class t ON t.oid = d.refobjid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
                WHERE s.relkind = 'S'
            """)
            for seq_name, table_name, col_name in cur.fetchall():
                try:
                    cur.execute(
                        f"SELECT setval('{seq_name}', COALESCE((SELECT MAX(\"{col_name}\") FROM \"{table_name}\"), 1))"
                    )
                except Exception:
                    pass
        conn.close()
    except Exception as e:
        logger.warning("Failed to reset sequences: %s", e)
