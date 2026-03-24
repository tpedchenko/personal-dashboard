"""Materialized view management for PostgreSQL dashboard aggregations.

This module is a no-op when the database backend is SQLite.
All functions gracefully handle errors by logging and continuing.
"""
import logging
from pathlib import Path

from src.db_backend import is_postgres

_log = logging.getLogger(__name__)

# Ordered list of materialized views managed by this module.
MATERIALIZED_VIEWS = [
    "mv_monthly_spending",
    "mv_daily_health",
    "mv_weekly_activity",
]

# Path to the DDL file containing CREATE MATERIALIZED VIEW statements.
_DDL_PATH = Path(__file__).resolve().parent.parent / "scripts" / "pg_schema.sql"

# Individual DDL blocks for each view (used by create_views_if_needed).
_VIEW_DDL = {
    "mv_monthly_spending": """
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_spending AS
SELECT
    date_trunc('month', date::date) AS month,
    category,
    type,
    SUM(amount_eur) AS total_eur,
    COUNT(*) AS tx_count
FROM transactions
WHERE type IN ('EXPENSE', 'INCOME')
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_spending
ON mv_monthly_spending(month, category, type);
""",
    "mv_daily_health": """
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_health AS
SELECT
    g.date,
    g.steps,
    g.calories_total,
    g.resting_hr,
    g.avg_stress,
    g.body_battery_high,
    g.body_battery_low,
    gs.sleep_score,
    gs.duration_seconds AS sleep_duration,
    w.weight,
    w.fat_ratio,
    w.bmi
FROM garmin_daily g
LEFT JOIN garmin_sleep gs ON gs.date = g.date
LEFT JOIN withings_measurements w ON w.date = g.date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_health
ON mv_daily_health(date);
""",
    "mv_weekly_activity": """
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_weekly_activity AS
SELECT
    date_trunc('week', date::date) AS week,
    COUNT(*) AS activity_count,
    SUM(duration_seconds) AS total_duration,
    SUM(calories) AS total_calories,
    SUM(distance_m) AS total_distance,
    AVG(avg_hr) AS avg_heart_rate
FROM garmin_activities
GROUP BY 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_weekly_activity
ON mv_weekly_activity(week);
""",
}


def refresh_view(view_name: str) -> None:
    """Refresh a single materialized view concurrently.

    No-op when the database backend is not PostgreSQL.
    Logs and continues on error.
    """
    if not is_postgres():
        return

    if view_name not in MATERIALIZED_VIEWS:
        _log.warning("Unknown materialized view: %s", view_name)
        return

    from src.database import get_conn

    with get_conn() as conn:
        try:
            cur = conn.cursor()
            cur.execute(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view_name}")
            conn.commit()
            _log.info("Refreshed materialized view: %s", view_name)
        except Exception as e:
            _log.error("Failed to refresh materialized view %s: %s", view_name, e)
            try:
                conn.rollback()
            except Exception:
                pass


def refresh_views() -> None:
    """Refresh all materialized views concurrently.

    No-op when the database backend is not PostgreSQL.
    Each view is refreshed independently; failures are logged and skipped.
    """
    if not is_postgres():
        return

    for view_name in MATERIALIZED_VIEWS:
        refresh_view(view_name)


def create_views_if_needed(conn) -> None:
    """Create materialized views if they don't already exist.

    Expects a raw psycopg2 connection (or _PgConnectionWrapper).
    No-op when the database backend is not PostgreSQL.

    Args:
        conn: A database connection. If it is a _PgConnectionWrapper,
              the underlying psycopg2 connection is used directly.
    """
    if not is_postgres():
        return

    from src.db_backend import _PgConnectionWrapper

    # Unwrap if needed to get raw psycopg2 connection.
    raw_conn = conn._conn if isinstance(conn, _PgConnectionWrapper) else conn

    for view_name, ddl in _VIEW_DDL.items():
        try:
            cur = raw_conn.cursor()
            cur.execute(ddl)
            raw_conn.commit()
            _log.info("Ensured materialized view exists: %s", view_name)
        except Exception as e:
            _log.error("Failed to create materialized view %s: %s", view_name, e)
            try:
                raw_conn.rollback()
            except Exception:
                pass
