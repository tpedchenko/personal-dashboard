"""Shared date-range helpers used across the codebase.

Eliminates duplicated month_start / prev_month / year_start calculations
that were copy-pasted in telegram_bot, analytics, db/settings, tabs, etc.
"""
from __future__ import annotations

from datetime import date, timedelta


def month_start(d: date | None = None) -> date:
    """First day of the month for *d* (default: today)."""
    return (d or date.today()).replace(day=1)


def month_start_iso(d: date | None = None) -> str:
    """First day of the month as ISO-8601 string."""
    return month_start(d).isoformat()


def year_start_iso(d: date | None = None) -> str:
    """Jan 1 of the year for *d* as ISO-8601 string."""
    return (d or date.today()).replace(month=1, day=1).isoformat()


def prev_month_range(d: date | None = None) -> tuple[date, date]:
    """Return (first_day, last_day) of the previous month."""
    first_this = month_start(d)
    last_prev = first_this - timedelta(days=1)
    return last_prev.replace(day=1), last_prev


def months_ago_start(months: int, d: date | None = None) -> date:
    """First day of the month *months* months before *d*.

    Example: months_ago_start(3) on 2026-03-15 returns date(2025, 12, 1).
    """
    start = month_start(d)
    for _ in range(months):
        start = (start - timedelta(days=1)).replace(day=1)
    return start
