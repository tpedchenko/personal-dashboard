"""Financial summary builder for AI analytics."""
from datetime import date

import src.database as _db
from src.date_utils import month_start_iso, year_start_iso


def _get_financial_summary() -> str:
    """Get financial data summary for AI analysis."""
    today = date.today()
    month_start = month_start_iso(today)
    year_start = year_start_iso(today)

    with _db.get_conn() as conn:
        # Current month
        month_exp = conn.execute(
            "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
            "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ?", (month_start,)
        ).fetchone()[0]
        month_inc = conn.execute(
            "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
            "WHERE type='INCOME' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ?", (month_start,)
        ).fetchone()[0]

        # Current year
        year_exp = conn.execute(
            "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
            "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ?", (year_start,)
        ).fetchone()[0]
        year_inc = conn.execute(
            "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
            "WHERE type='INCOME' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ?", (year_start,)
        ).fetchone()[0]

        # By category this month
        cats = conn.execute(
            "SELECT category, SUM(amount_eur) as total FROM transactions "
            "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ? "
            "GROUP BY category ORDER BY total DESC LIMIT 10",
            (month_start,),
        ).fetchall()

        # Monthly totals for the year
        monthly = conn.execute(
            "SELECT year || '-' || printf('%02d', month) as ym, type, SUM(amount_eur) "
            "FROM transactions WHERE COALESCE(sub_type,'') != 'TRANSFER' AND date >= ? "
            "GROUP BY ym, type ORDER BY ym",
            (year_start,),
        ).fetchall()

        # By category all year
        year_cats = conn.execute(
            "SELECT category, SUM(amount_eur) as total FROM transactions "
            "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ? "
            "GROUP BY category ORDER BY total DESC LIMIT 15",
            (year_start,),
        ).fetchall()

    lines = [
        f"Дата: {today.isoformat()}",
        f"\nПоточний місяць ({today.strftime('%B %Y')}):",
        f"  Витрати: {month_exp:,.0f}€, Доходи: {month_inc:,.0f}€, Нетто: {month_inc - month_exp:,.0f}€",
        f"\nПоточний рік ({today.year}):",
        f"  Витрати: {year_exp:,.0f}€, Доходи: {year_inc:,.0f}€, Нетто: {year_inc - year_exp:,.0f}€",
        f"\nТоп категорії цього місяця:",
    ]
    for cat, total in cats:
        lines.append(f"  {cat}: {total:,.0f}€")

    lines.append(f"\nПо місяцях {today.year}:")
    for ym, tp, total in monthly:
        lines.append(f"  {ym} {tp}: {total:,.0f}€")

    lines.append(f"\nТоп категорії за рік:")
    for cat, total in year_cats:
        lines.append(f"  {cat}: {total:,.0f}€")

    return "\n".join(lines)
