"""Scheduled job handlers for PD Bot."""
import logging
from datetime import date, timedelta

from telegram.ext import ContextTypes

import src.database as _db
from src.database import get_budget_status
from src.date_utils import month_start_iso
from src.retry import tg_send_with_retry

from src.telegram_bot.config import TARAS_USER_ID, _set_user_context

logger = logging.getLogger(__name__)


async def _daily_report_job(context: ContextTypes.DEFAULT_TYPE):
    """Send daily morning report to Taras at 7:00."""
    if not TARAS_USER_ID:
        return
    try:
        today = date.today()
        yesterday = (today - timedelta(days=1)).isoformat()
        month_start = month_start_iso(today)

        with _db.get_conn() as conn:
            y_exp = conn.execute(
                "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
                "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date = ?",
                (yesterday,),
            ).fetchone()[0]

            mtd_exp = conn.execute(
                "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
                "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ?",
                (month_start,),
            ).fetchone()[0]

            mood_row = conn.execute(
                "SELECT COUNT(*) FROM daily_log WHERE date >= ? AND general_note LIKE '%mood%'",
                ((today - timedelta(days=30)).isoformat(),),
            ).fetchone()
            mood_days = mood_row[0] if mood_row else 0

            garmin_row = conn.execute(
                "SELECT resting_hr, sleep_score, body_battery_high, "
                "training_readiness_score, hrv_last_night, steps "
                "FROM garmin_daily WHERE date = ? LIMIT 1",
                (yesterday,),
            ).fetchone()

            mood_rows = conn.execute(
                "SELECT mood_delta FROM daily_log WHERE date <= ? ORDER BY date DESC LIMIT 30",
                (yesterday,),
            ).fetchall()
            mood_streak = 0
            for r in mood_rows:
                if r[0] is not None and r[0] > 0:
                    mood_streak += 1
                else:
                    break

        lines = [f"☀️ *Доброго ранку!* {today.strftime('%d.%m.%Y')}\n"]

        if y_exp > 0:
            lines.append(f"💸 Вчора витрачено: {y_exp:,.0f}€")
        else:
            lines.append("✨ Вчора без витрат!")

        lines.append(f"📊 Витрати за місяць: {mtd_exp:,.0f}€")

        budget_status = get_budget_status(month_start, today.isoformat())
        warnings = [s for s in budget_status if s["pct"] >= 70]
        if warnings:
            lines.append("")
            for w in warnings[:3]:
                icon = "🔴" if w["pct"] >= 90 else "⚠️"
                lines.append(f"{icon} {w['category']}: {w['pct']:.0f}% бюджету")

        if garmin_row:
            lines.append("")
            rhr, ss, bb, tr, hrv, steps = garmin_row
            if hrv:
                lines.append(f"💚 HRV: {int(hrv)}ms")
            if rhr:
                lines.append(f"❤️ Пульс: {int(rhr)} bpm")
            if ss:
                lines.append(f"😴 Сон: {int(ss)}/100")
            if bb:
                lines.append(f"🔋 Body Battery: {int(bb)}%")
            if tr:
                tr_i = int(tr)
                _adv = "повне тренування" if tr_i >= 70 else ("легке тренування" if tr_i >= 50 else "відпочинок")
                lines.append(f"💪 Training Ready: {tr_i}% → {_adv}")
            if steps:
                lines.append(f"👣 Кроків: {int(steps):,}")

        if mood_streak > 0:
            lines.append(f"\n🔥 Mood streak: {mood_streak} днів поспіль")

        await tg_send_with_retry(
            context.bot.send_message,
            chat_id=TARAS_USER_ID,
            text="\n".join(lines),
            parse_mode="Markdown",
        )
    except Exception as e:
        logger.error("Daily report failed: %s", e, exc_info=True)


async def _mood_reminder_job(context: ContextTypes.DEFAULT_TYPE):
    """21:00 UTC — remind to log mood if not done today."""
    if not TARAS_USER_ID:
        return
    try:
        today = date.today().isoformat()
        with _db.get_conn() as conn:
            existing = conn.execute(
                "SELECT id FROM daily_log WHERE date = ?", (today,)
            ).fetchone()
        if not existing:
            await tg_send_with_retry(
                context.bot.send_message,
                chat_id=TARAS_USER_ID,
                text="🧠 Не забув залогувати настрій? Напиши /mood N (-5 до +5)",
            )
    except Exception as e:
        logger.error("Mood reminder failed: %s", e)


async def _recurring_tx_job(context: ContextTypes.DEFAULT_TYPE):
    """1st of month at 8:00 — insert recurring transactions."""
    try:
        today = date.today()
        if today.day != 1:
            return
        from src.database import process_recurring_transactions
        process_recurring_transactions(today.year, today.month)
        if TARAS_USER_ID:
            await tg_send_with_retry(
                context.bot.send_message,
                chat_id=TARAS_USER_ID,
                text=f"🔄 Регулярні транзакції за {today.strftime('%B %Y')} додано автоматично.",
            )
    except Exception as e:
        logger.error("Recurring tx job failed: %s", e)


async def _weekly_report_job(context: ContextTypes.DEFAULT_TYPE):
    """Monday morning — weekly summary."""
    if not TARAS_USER_ID:
        return
    try:
        from datetime import datetime
        if datetime.now().weekday() != 0:  # Monday only
            return
        today = date.today()
        week_ago = today - timedelta(days=7)
        week_start = week_ago.isoformat()

        with _db.get_conn() as conn:
            w_exp = conn.execute(
                "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
                "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ?",
                (week_start,),
            ).fetchone()[0]
            pw_start = (week_ago - timedelta(days=7)).isoformat()
            pw_exp = conn.execute(
                "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
                "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ? AND date < ?",
                (pw_start, week_start),
            ).fetchone()[0]
            cats = conn.execute(
                "SELECT category, SUM(amount_eur) as s FROM transactions "
                "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date >= ? "
                "GROUP BY category ORDER BY s DESC LIMIT 5",
                (week_start,),
            ).fetchall()
            mood_rows = conn.execute(
                "SELECT AVG(mood_delta), COUNT(*) FROM daily_log WHERE date >= ?",
                (week_start,),
            ).fetchone()

        lines = [f"📊 *Щотижневий звіт* ({week_ago.strftime('%d.%m')} — {today.strftime('%d.%m')})\n"]

        pct_change = ((w_exp - pw_exp) / pw_exp * 100) if pw_exp > 0 else 0
        arrow = "↑" if pct_change > 0 else "↓"
        lines.append(f"💸 Витрати: {w_exp:,.0f}€ ({arrow}{abs(pct_change):.0f}% vs минулий тиждень)")
        for cat, s in cats:
            lines.append(f"  • {cat}: {s:,.0f}€")

        if mood_rows and mood_rows[1] > 0:
            avg_mood = mood_rows[0] or 0
            lines.append(f"\n🧠 Avg mood: {avg_mood:+.1f} ({mood_rows[1]} записів)")

        # Garmin
        try:
            garmin_row = None
            with _db.get_conn() as conn:
                garmin_row = conn.execute(
                    "SELECT AVG(hrv_last_night), AVG(resting_hr), AVG(steps), AVG(sleep_score) "
                    "FROM garmin_daily WHERE date >= ?",
                    (week_start,),
                ).fetchone()
            if garmin_row and garmin_row[0]:
                lines.append(f"\n⌚ Garmin (avg за тиждень):")
                if garmin_row[0]:
                    lines.append(f"  💚 HRV: {garmin_row[0]:.0f}ms")
                if garmin_row[1]:
                    lines.append(f"  ❤️ RHR: {garmin_row[1]:.0f} bpm")
                if garmin_row[2]:
                    lines.append(f"  👣 Кроки: {garmin_row[2]:,.0f}")
                if garmin_row[3]:
                    lines.append(f"  😴 Sleep: {garmin_row[3]:.0f}/100")
        except Exception:
            logger.debug("Weekly report: Garmin data fetch failed")

        await tg_send_with_retry(
            context.bot.send_message,
            chat_id=TARAS_USER_ID, text="\n".join(lines), parse_mode="Markdown",
        )
    except Exception as e:
        logger.error("Weekly report failed: %s", e, exc_info=True)


async def _anomaly_check_job(context: ContextTypes.DEFAULT_TYPE):
    """Check for anomalies daily at 20:00 UTC."""
    if not TARAS_USER_ID:
        return
    try:
        today = date.today()
        yesterday = (today - timedelta(days=1)).isoformat()
        alerts = []

        with _db.get_conn() as conn:
            avg_daily = conn.execute(
                "SELECT AVG(daily_total) FROM ("
                "  SELECT date, SUM(amount_eur) as daily_total FROM transactions "
                "  WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' "
                "  AND date >= ? GROUP BY date"
                ")",
                ((today - timedelta(days=90)).isoformat(),),
            ).fetchone()
            if avg_daily and avg_daily[0]:
                y_exp = conn.execute(
                    "SELECT COALESCE(SUM(amount_eur),0) FROM transactions "
                    "WHERE type='EXPENSE' AND COALESCE(sub_type,'') != 'TRANSFER' AND date = ?",
                    (yesterday,),
                ).fetchone()[0]
                if y_exp > avg_daily[0] * 3 and y_exp > 50:
                    alerts.append(f"💰 Незвичні витрати вчора: {y_exp:,.0f}€ (норма ~{avg_daily[0]:,.0f}€/день)")

            garmin = conn.execute(
                "SELECT hrv_last_night FROM garmin_daily WHERE date = ? LIMIT 1",
                (yesterday,),
            ).fetchone()
            if garmin and garmin[0]:
                avg_hrv = conn.execute(
                    "SELECT AVG(hrv_last_night) FROM garmin_daily "
                    "WHERE date >= ? AND hrv_last_night IS NOT NULL",
                    ((today - timedelta(days=30)).isoformat(),),
                ).fetchone()
                if avg_hrv and avg_hrv[0] and garmin[0] < avg_hrv[0] * 0.8:
                    alerts.append(
                        f"💚 HRV критично низький: {int(garmin[0])}ms "
                        f"(avg: {avg_hrv[0]:.0f}ms, -{ (1 - garmin[0]/avg_hrv[0])*100:.0f}%)"
                    )

            sleep_rows = conn.execute(
                "SELECT sleep_score FROM garmin_sleep "
                "WHERE date >= ? AND sleep_score IS NOT NULL ORDER BY date DESC LIMIT 3",
                ((today - timedelta(days=3)).isoformat(),),
            ).fetchall()
            if len(sleep_rows) == 3 and all(r[0] < 60 for r in sleep_rows):
                avg_ss = sum(r[0] for r in sleep_rows) / 3
                alerts.append(f"😴 Хронічний недосип: Sleep Score {avg_ss:.0f}/100 (3 ночі поспіль <60)")

        if alerts:
            text = "⚠️ *Anomaly Alert*\n\n" + "\n\n".join(alerts)
            await tg_send_with_retry(
                context.bot.send_message,
                chat_id=TARAS_USER_ID, text=text, parse_mode="Markdown",
            )
    except Exception as e:
        logger.error("Anomaly check failed: %s", e)


async def _auto_sync_job(context: ContextTypes.DEFAULT_TYPE):
    """Every-5-min job: sync Garmin + Withings + Monobank data (runs 7:00-00:00)."""
    from datetime import datetime
    hour = datetime.now().hour
    if hour < 7:
        return

    _set_user_context(TARAS_USER_ID or 0)

    results = []

    # Garmin
    try:
        from src.garmin import sync_garmin_smart
        counts = sync_garmin_smart()
        total = sum(v for k, v in counts.items() if k != "errors")
        if total > 0:
            results.append(f"Garmin: {total} records")
    except Exception as e:
        logger.warning("Auto-sync Garmin failed: %s", e)

    # Withings
    try:
        from src.withings import is_connected, sync_withings_smart
        if is_connected():
            counts = sync_withings_smart()
            n = counts.get("measurements", 0)
            if n > 0:
                results.append(f"Withings: {n} measurements")
    except Exception as e:
        logger.warning("Auto-sync Withings failed: %s", e)

    # Monobank
    try:
        from src.database import get_secret
        _mt = get_secret("monobank_token")
        _ma = get_secret("monobank_account_id")
        if _mt and _ma:
            from src.monobank import sync_monobank
            res = sync_monobank(
                token=_mt, account_id=_ma, days=1,
                account_name=get_secret("monobank_account_name") or "Mono",
            )
            if res["synced"] > 0:
                results.append(f"Monobank: {res['synced']} transactions")
    except Exception as e:
        logger.warning("Auto-sync Monobank failed: %s", e)

    # bunq
    try:
        from src.database import get_secret
        _bk = get_secret("bunq_api_key")
        _bunq_auto = get_secret("bunq_auto_sync") or "auto"
        if _bk and _bunq_auto == "auto":
            import json as _json_bunq_tg
            from src.bunq_integration import sync_bunq
            _bunq_suffix = get_secret("bunq_user_suffix") or "default"
            _bunq_maps_json = get_secret("bunq_account_mappings") or "[]"
            try:
                _bunq_maps = _json_bunq_tg.loads(_bunq_maps_json)
            except Exception:
                logger.debug("Failed to parse bunq_account_mappings JSON")
                _bunq_maps = []
            for _bm in _bunq_maps:
                if _bm.get("account_id"):
                    res = sync_bunq(
                        api_key=_bk, account_id=_bm["account_id"], days=1,
                        account_name=_bm.get("account_name", "bunq"),
                        user_suffix=_bunq_suffix,
                    )
                    if res["synced"] > 0:
                        results.append(f"bunq: {res['synced']} transactions")
    except Exception as e:
        logger.warning("Auto-sync bunq failed: %s", e)

    # AI Notes
    try:
        from src.ai_notes import regenerate_all_notes
        regenerate_all_notes(max_age_hours=20.0)
    except Exception as e:
        logger.warning("Auto-sync AI notes failed: %s", e)

    if results:
        logger.info("Auto-sync completed: %s", ", ".join(results))
