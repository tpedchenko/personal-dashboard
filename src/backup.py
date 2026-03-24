"""Data export for PD.

- Local Excel export (multi-sheet .xlsx) for user download
"""

import io
from datetime import date

import pandas as pd


# ── Export ────────────────────────────────────────────────────────────────────

# Tables to export: (sql, sheet_name)
_EXPORT_TABLES = [
    (
        "SELECT date, type, category, amount_eur, amount_original, "
        "currency_original, account, description, owner "
        "FROM transactions ORDER BY date DESC",
        "Transactions",
    ),
    ("SELECT * FROM daily_log ORDER BY date DESC", "Daily Log"),
    ("SELECT * FROM garmin_daily ORDER BY date DESC", "Garmin Daily"),
    ("SELECT * FROM garmin_activities ORDER BY date DESC", "Garmin Activities"),
    ("SELECT * FROM garmin_sleep ORDER BY date DESC", "Garmin Sleep"),
    ("SELECT * FROM garmin_body_composition ORDER BY date DESC", "Body Composition"),
    ("SELECT * FROM withings_measurements ORDER BY date DESC", "Withings"),
    ("SELECT * FROM budgets", "Budgets"),
    ("SELECT * FROM recurring_transactions", "Recurring"),
    ("SELECT * FROM savings_goals", "Savings Goals"),
    ("SELECT * FROM shopping_items ORDER BY added_at DESC", "Shopping List"),
    ("SELECT * FROM shopping_history ORDER BY id DESC", "Shopping History"),
]


def generate_export_excel() -> bytes:
    """Generate multi-sheet Excel file with all personal data."""
    from src.database import get_conn, DB_PATH

    buf = io.BytesIO()

    with get_conn() as conn:
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            # Summary sheet
            tx_count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
            date_range = conn.execute(
                "SELECT MIN(date), MAX(date) FROM transactions"
            ).fetchone()
            db_size_mb = DB_PATH.stat().st_size / (1024 * 1024) if DB_PATH.exists() else 0

            summary = pd.DataFrame([{
                "Export Date": date.today().isoformat(),
                "Total Transactions": tx_count,
                "Date Range": f"{date_range[0] or '—'} to {date_range[1] or '—'}",
                "DB Size (MB)": round(db_size_mb, 1),
            }])
            summary.to_excel(writer, sheet_name="Summary", index=False)

            # Data sheets
            for sql, sheet_name in _EXPORT_TABLES:
                try:
                    from src.database import read_sql
                    df = read_sql(sql, conn)
                    if not df.empty:
                        df.to_excel(writer, sheet_name=sheet_name, index=False)
                except Exception:
                    pass  # Table might not exist

    buf.seek(0)
    return buf.getvalue()
