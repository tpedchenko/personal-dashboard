"""Cron-like scheduler for NAS deployment.

Long-running process with periodic jobs for data sync, reports, and backups.
Uses APScheduler (already available via python-telegram-bot[job-queue]).
"""

import logging
import sys
import os
import signal

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("scheduler")

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------
import psycopg2
import psycopg2.pool
from contextlib import contextmanager

_pool = None


def _get_pool():
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1, maxconn=3,
            dsn=os.environ["DATABASE_URL"],
        )
    return _pool


@contextmanager
def get_conn():
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


# ---------------------------------------------------------------------------
# Telegram helper
# ---------------------------------------------------------------------------
def _get_bot_token() -> str | None:
    """Get bot token from DB (admin secret) or fall back to env var."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Look for the admin bot token in secrets table
                cur.execute("""
                    SELECT s.value FROM secrets s
                    JOIN users u ON u.id = s.user_id
                    WHERE s.key = 'telegram_bot_token_admin' AND u.role = 'owner'
                    LIMIT 1
                """)
                row = cur.fetchone()
                if row and row[0]:
                    # Try to decrypt (handles both encrypted and plaintext)
                    try:
                        from src.encryption import decrypt_value
                        return decrypt_value(row[0])
                    except Exception:
                        return row[0]
    except Exception as e:
        logger.debug("Could not load bot token from DB: %s", e)
    return os.environ.get("TELEGRAM_BOT_TOKEN")


def _get_all_telegram_chat_ids() -> list[int]:
    """Get all linked Telegram chat IDs from DB."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT telegram_id FROM telegram_links WHERE telegram_id > 0")
                return [row[0] for row in cur.fetchall()]
    except Exception as e:
        logger.debug("Could not load telegram chat IDs: %s", e)
    # Fallback to env var
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if chat_id:
        return [int(chat_id)]
    return []


def send_telegram_message(text, parse_mode="Markdown", chat_id=None):
    """Send Telegram message to a specific user or all linked users."""
    import requests

    token = _get_bot_token()
    if not token:
        return False

    # If specific chat_id provided, send only to that user
    if chat_id:
        chat_ids = [int(chat_id)]
    else:
        chat_ids = _get_all_telegram_chat_ids()

    if not chat_ids:
        return False

    success = False
    for cid in chat_ids:
        try:
            resp = requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": cid, "text": text, "parse_mode": parse_mode},
                timeout=15,
            )
            resp.raise_for_status()
            success = True
        except Exception as e:
            logger.error("Telegram send to %s failed: %s", cid, e)
    return success


# ---------------------------------------------------------------------------
# Sync timestamp helper
# ---------------------------------------------------------------------------

def _update_last_sync(user_id: int, user_email: str, integration: str, status: str = "ok"):
    """Write last sync timestamp + status for integration."""
    from datetime import datetime
    ts = datetime.utcnow().isoformat() + "Z"
    value = f"{ts}|{status}"
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO user_preferences (user_id, key, value)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, key) DO UPDATE SET value = %s
                """, (user_id, f"{integration}_last_sync", value, value))
    except Exception as e:
        logger.warning("Failed to update last_sync for %s: %s", integration, e)


# ---------------------------------------------------------------------------
# Report builders (previously in functions/daily_report and functions/weekly_report)
# ---------------------------------------------------------------------------

def _generate_ollama_insights() -> str | None:
    """Generate AI insights via Ollama pd-assistant for Telegram."""
    import requests
    try:
        # Get data context from DB
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT content FROM ai_context_snapshots
                    WHERE period_type = 'chat-context'
                    ORDER BY generated_at DESC LIMIT 1
                """)
                row = cur.fetchone()
                if not row:
                    return None
                context = row[0]

        resp = requests.post(
            "http://ollama:11434/api/chat",
            json={
                "model": "pd-assistant",
                "stream": False,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are an AI analyst. Analyze the user data and provide 3-5 brief insights. "
                            "Format each as: emoji + one sentence with specific numbers. "
                            "Use Ukrainian language. No headers, just the list."
                        ),
                    },
                    {"role": "user", "content": f"Дай інсайти:\n{context[:3000]}"},
                ],
            },
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data.get("message", {}).get("content", "")
        return content.strip() if content.strip() else None
    except Exception as e:
        logger.warning("Ollama insights failed: %s", e)
        return None


def _build_daily_report() -> str | None:
    """Build daily summary text for Telegram."""
    from datetime import date, timedelta

    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    lines = [f"📊 *Daily Report — {today}*\n"]

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Today's transactions
                cur.execute(
                    "SELECT type, COUNT(*), COALESCE(SUM(amount_eur), 0) "
                    "FROM transactions WHERE date = %s GROUP BY type",
                    (today,),
                )
                tx_rows = cur.fetchall()
                if tx_rows:
                    for tx_type, cnt, total in tx_rows:
                        emoji = "💰" if tx_type == "INCOME" else "💸"
                        lines.append(f"{emoji} {tx_type}: {cnt} txns, €{total:.0f}")
                else:
                    lines.append("No transactions today.")

                # Mood/daily log
                cur.execute(
                    "SELECT mood_delta, level FROM daily_log WHERE date = %s LIMIT 1",
                    (today,),
                )
                mood_row = cur.fetchone()
                if mood_row:
                    mood, level = mood_row
                    lines.append(f"\n😊 Mood: {mood or '—'}, Level: {level or '—'}")

    except Exception as e:
        logger.warning("daily_report query failed: %s", e)
        return None

    # Add AI insights
    insights = _generate_ollama_insights()
    if insights:
        lines.append(f"\n✨ *AI Insights:*\n{insights}")

    return "\n".join(lines) if len(lines) > 1 else None


def _build_weekly_report() -> str | None:
    """Build weekly summary text for Telegram."""
    from datetime import date, timedelta

    today = date.today()
    week_ago = (today - timedelta(days=7)).isoformat()
    today_str = today.isoformat()

    lines = [f"📊 *Weekly Report — {week_ago} to {today_str}*\n"]

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Week's expenses by category
                cur.execute(
                    "SELECT category, COUNT(*), COALESCE(SUM(amount_eur), 0) "
                    "FROM transactions "
                    "WHERE date >= %s AND date <= %s AND type = 'EXPENSE' "
                    "GROUP BY category ORDER BY 3 DESC LIMIT 10",
                    (week_ago, today_str),
                )
                cat_rows = cur.fetchall()
                if cat_rows:
                    total_expense = sum(r[2] for r in cat_rows)
                    lines.append(f"💸 Total expenses: €{total_expense:.0f}\n")
                    for cat, cnt, amt in cat_rows:
                        lines.append(f"  • {cat}: €{amt:.0f} ({cnt} txns)")
                else:
                    lines.append("No expenses this week.")

                # Week's income
                cur.execute(
                    "SELECT COALESCE(SUM(amount_eur), 0) FROM transactions "
                    "WHERE date >= %s AND date <= %s AND type = 'INCOME'",
                    (week_ago, today_str),
                )
                income = cur.fetchone()[0]
                if income:
                    lines.append(f"\n💰 Income: €{income:.0f}")

    except Exception as e:
        logger.warning("weekly_report query failed: %s", e)
        return None

    return "\n".join(lines) if len(lines) > 1 else None


# ---------------------------------------------------------------------------
# Job wrappers
# ---------------------------------------------------------------------------

# Store pending MFA state per user (in-memory, survives across scheduler ticks)
_garmin_mfa_pending: dict[int, tuple] = {}  # user_id -> (client, client_state)


def job_sync_garmin():
    """Sync Garmin data for all users. Supports MFA via DB-based code exchange."""
    logger.info("Running: sync_garmin")
    try:
        from src.sync.garmin_sync import authenticate_garmin, GarminMFARequired, sync_garmin_data
        from src.database import set_current_user, get_conn as app_get_conn
        from pathlib import Path

        garth_base = Path(os.environ.get("GARTH_SESSION_DIR", "/data/garth_sessions"))

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.id, u.email, s1.value, s2.value
                    FROM users u
                    JOIN secrets s1 ON s1.user_id = u.id AND s1.key = 'garmin_email'
                    JOIN secrets s2 ON s2.user_id = u.id AND s2.key = 'garmin_password'
                    WHERE s1.value IS NOT NULL AND s1.value != ''
                      AND s2.value IS NOT NULL AND s2.value != ''
                """)
                users = cur.fetchall()

        for user_id, user_email, garmin_email, garmin_password in users:
            garth_dir = str(garth_base / str(user_id))
            os.makedirs(garth_dir, exist_ok=True)

            # Check if there's a pending MFA code from the user
            mfa_code = None
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT value FROM user_preferences WHERE user_id = %s AND key = 'garmin_mfa_code'",
                        (user_id,),
                    )
                    row = cur.fetchone()
                    if row and row[0] and row[0].strip():
                        mfa_code = row[0].strip()

            client = None

            # If we have a pending MFA state AND user provided a code, resume login
            if user_id in _garmin_mfa_pending and mfa_code:
                pending_client, pending_state = _garmin_mfa_pending[user_id]
                try:
                    pending_client.resume_login(pending_state, mfa_code)
                    pending_client.garth.dump(garth_dir)
                    client = pending_client
                    del _garmin_mfa_pending[user_id]
                    logger.info("Garmin MFA login completed for user %s.", user_id)
                    # Clear the used MFA code
                    with get_conn() as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                "UPDATE user_preferences SET value = '' WHERE user_id = %s AND key = 'garmin_mfa_code'",
                                (user_id,),
                            )
                except Exception as e:
                    logger.error("Garmin MFA resume failed for user %s: %s", user_id, e)
                    del _garmin_mfa_pending[user_id]
                    # Clear invalid MFA code
                    with get_conn() as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                "UPDATE user_preferences SET value = '' WHERE user_id = %s AND key = 'garmin_mfa_code'",
                                (user_id,),
                            )
                    continue

            # Normal auth (with optional MFA code for fresh login)
            if client is None:
                try:
                    client = authenticate_garmin(garmin_email, garmin_password, garth_dir, mfa_code=mfa_code)
                    # Clear used MFA code if any
                    if mfa_code:
                        with get_conn() as conn:
                            with conn.cursor() as cur:
                                cur.execute(
                                    "UPDATE user_preferences SET value = '' WHERE user_id = %s AND key = 'garmin_mfa_code'",
                                    (user_id,),
                                )
                except GarminMFARequired as e:
                    # Store client state for later MFA resume
                    _garmin_mfa_pending[user_id] = (e.client, e.client_state)
                    # Set status so UI knows MFA is needed
                    with get_conn() as conn:
                        with conn.cursor() as cur:
                            cur.execute("""
                                INSERT INTO user_preferences (user_id, key, value)
                                VALUES (%s, 'garmin_mfa_status', 'required')
                                ON CONFLICT (user_id, key) DO UPDATE SET value = 'required'
                            """, (user_id,))
                    logger.warning("Garmin MFA required for user %s — waiting for code via UI.", user_id)
                    continue
                except Exception as e:
                    logger.error("Garmin auth failed for user %s: %s", user_id, e)
                    continue

            # Clear MFA status on successful auth
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO user_preferences (user_id, key, value)
                        VALUES (%s, 'garmin_mfa_status', 'ok')
                        ON CONFLICT (user_id, key) DO UPDATE SET value = 'ok'
                    """, (user_id,))

            # Sync data
            set_current_user(user_email)
            with app_get_conn() as conn:
                counts = sync_garmin_data(client, conn)
                total = sum(v for k, v in counts.items() if k != "errors")
                if total > 0:
                    logger.info("Garmin user %s: %s", user_id, counts)
                _update_last_sync(user_id, user_email, "garmin", f"ok: {counts}")

            try:
                client.garth.dump(garth_dir)
            except Exception:
                pass

    except Exception as e:
        logger.error("sync_garmin failed: %s", e, exc_info=True)


def job_sync_withings():
    """Sync Withings data for all users."""
    logger.info("Running: sync_withings")
    try:
        import json
        from src.sync.withings_sync import refresh_withings_token, sync_withings_measurements

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.id, u.email, s.value
                    FROM users u
                    JOIN secrets s ON s.user_id = u.id AND s.key = 'withings_tokens'
                    WHERE s.value IS NOT NULL AND s.value != ''
                """)
                users = cur.fetchall()

        for user_id, user_email, tokens_json in users:
            try:
                tokens = json.loads(tokens_json)
                access_token = tokens["access_token"]
                client_id = tokens.get("client_id")
                client_secret = tokens.get("consumer_secret")

                def _do_refresh():
                    updated = refresh_withings_token(tokens, client_id, client_secret)
                    with get_conn() as c:
                        with c.cursor() as cur:
                            cur.execute(
                                "INSERT INTO secrets (user_id, key, value) "
                                "VALUES (%s, 'withings_tokens', %s) "
                                "ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value",
                                (user_id, json.dumps(updated)),
                            )
                    return updated["access_token"]

                with get_conn() as conn:
                    result = sync_withings_measurements(access_token, conn, refresh_func=_do_refresh)
                    count = result.get("measurements", 0)
                    if count > 0:
                        logger.info("Withings user %s: %d measurements", user_id, count)
                    _update_last_sync(user_id, user_email, "withings", f"ok: {count} measurements")
            except Exception as e:
                logger.error("Withings sync failed for user %s: %s", user_id, e)
                _update_last_sync(user_id, user_email, "withings", f"error: {e}")

    except Exception as e:
        logger.error("sync_withings failed: %s", e, exc_info=True)


def job_sync_monobank():
    """Sync Monobank transactions for all users (respects auto/manual setting)."""
    logger.info("Running: sync_monobank")
    try:
        import json as _json
        from src.monobank import sync_monobank
        from src.db import set_current_user

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.id, u.email, s1.value,
                           COALESCE(s_map.value, ''),
                           COALESCE(s2.value, ''),
                           COALESCE(s3.value, 'Mono'),
                           COALESCE(s_auto.value, 'auto')
                    FROM users u
                    JOIN secrets s1 ON s1.user_id = u.id AND s1.key = 'monobank_token'
                    LEFT JOIN secrets s_map ON s_map.user_id = u.id AND s_map.key = 'monobank_account_mappings'
                    LEFT JOIN secrets s2 ON s2.user_id = u.id AND s2.key = 'monobank_account_id'
                    LEFT JOIN secrets s3 ON s3.user_id = u.id AND s3.key = 'monobank_account_name'
                    LEFT JOIN secrets s_auto ON s_auto.user_id = u.id AND s_auto.key = 'monobank_auto_sync'
                    WHERE s1.value IS NOT NULL AND s1.value != ''
                """)
                users = cur.fetchall()

        for user_id, user_email, token, mappings_json, old_acc_id, old_acc_name, auto_sync in users:
            set_current_user(user_email)
            # Skip users with manual sync mode
            if auto_sync == "manual":
                continue

            # Parse account mappings (new multi-account format)
            account_list = []
            if mappings_json:
                try:
                    account_list = _json.loads(mappings_json)
                except Exception:
                    pass
            # Fallback to old single-account config
            if not account_list and old_acc_id:
                account_list = [{"account_id": old_acc_id, "account_name": old_acc_name}]

            if not account_list:
                continue

            for acc in account_list:
                acc_id = acc.get("account_id", "")
                acc_name = acc.get("account_name", "Mono")
                if not acc_id:
                    continue
                try:
                    result = sync_monobank(
                        token=token,
                        account_id=acc_id,
                        days=1,
                        account_name=acc_name,
                    )
                    if result["synced"] > 0:
                        logger.info("Monobank user %s acc %s: synced %d, skipped %d",
                                    user_id, acc_name, result["synced"], result["skipped"])
                except Exception as e:
                    logger.error("Monobank sync failed for user %s acc %s: %s", user_id, acc_name, e)

    except Exception as e:
        logger.error("sync_monobank failed: %s", e, exc_info=True)


def job_sync_bunq():
    """Sync bunq transactions for all users (respects auto/manual setting)."""
    logger.info("Running: sync_bunq")
    try:
        import json as _json
        from src.bunq_integration import sync_bunq
        from src.db import set_current_user

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.id, u.email, s1.value,
                           COALESCE(s_map.value, '[]'),
                           COALESCE(s_suffix.value, 'default'),
                           COALESCE(s_auto.value, 'auto')
                    FROM users u
                    JOIN secrets s1 ON s1.user_id = u.id AND s1.key IN ('bunq_api_key', 'bunq_api_token')
                    LEFT JOIN secrets s_map ON s_map.user_id = u.id AND s_map.key = 'bunq_account_mappings'
                    LEFT JOIN secrets s_suffix ON s_suffix.user_id = u.id AND s_suffix.key = 'bunq_user_suffix'
                    LEFT JOIN secrets s_auto ON s_auto.user_id = u.id AND s_auto.key = 'bunq_auto_sync'
                    WHERE s1.value IS NOT NULL AND s1.value != ''
                """)
                users = cur.fetchall()

        for user_id, user_email, api_key, mappings_json, user_suffix, auto_sync in users:
            set_current_user(user_email)
            if auto_sync == "manual":
                continue

            try:
                account_list = _json.loads(mappings_json)
            except Exception:
                account_list = []

            if not account_list:
                continue

            for acc in account_list:
                acc_id = acc.get("account_id", 0)
                acc_name = acc.get("account_name", "bunq")
                if not acc_id:
                    continue
                try:
                    result = sync_bunq(
                        api_key=api_key,
                        account_id=acc_id,
                        days=1,
                        account_name=acc_name,
                        user_suffix=user_suffix,
                    )
                    if result["synced"] > 0:
                        logger.info("bunq user %s acc %s: synced %d, skipped %d",
                                    user_id, acc_name, result["synced"], result["skipped"])
                except Exception as e:
                    logger.error("bunq sync failed for user %s acc %s: %s", user_id, acc_name, e)

    except Exception as e:
        logger.error("sync_bunq failed: %s", e, exc_info=True)


def job_daily_report():
    """Send daily evening report via Telegram."""
    logger.info("Running: daily_report")
    try:
        text = _build_daily_report()
        if text:
            send_telegram_message(text)
            logger.info("Daily report sent.")
    except Exception as e:
        logger.error("daily_report failed: %s", e, exc_info=True)


def job_weekly_report():
    """Send weekly report via Telegram."""
    logger.info("Running: weekly_report")
    try:
        text = _build_weekly_report()
        if text:
            send_telegram_message(text)
            logger.info("Weekly report sent.")
    except Exception as e:
        logger.error("weekly_report failed: %s", e, exc_info=True)


def job_mood_reminder():
    """Send mood reminder if not logged today."""
    logger.info("Running: mood_reminder")
    try:
        from datetime import date

        today = date.today().isoformat()
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM daily_log WHERE date = %s LIMIT 1", (today,))
                if cur.fetchone() is not None:
                    logger.info("Mood already logged for %s.", today)
                    return

        send_telegram_message("Ne zabuv zalohuvaty nastriy? Napyshy /mood N (-5 do +5)", parse_mode=None)
        logger.info("Mood reminder sent.")
    except Exception as e:
        logger.error("mood_reminder failed: %s", e, exc_info=True)


def job_pg_backup():
    """Run pg_dump and rotate backups (30 daily + 12 monthly)."""
    logger.info("Running: pg_backup")
    try:
        import subprocess
        from datetime import date, timedelta
        from pathlib import Path

        backup_dir = Path("/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)

        today = date.today()
        daily_file = backup_dir / f"daily_{today.isoformat()}.sql.gz"

        db_url = os.environ.get("DATABASE_URL", "")
        # Use subprocess list args to avoid shell injection via DATABASE_URL
        with open(daily_file, "wb") as f:
            pg_dump = subprocess.Popen(
                ["pg_dump", db_url],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            gzip_proc = subprocess.Popen(
                ["gzip"],
                stdin=pg_dump.stdout, stdout=f, stderr=subprocess.PIPE,
            )
            pg_dump.stdout.close()
            _, gzip_err = gzip_proc.communicate(timeout=300)
            pg_dump.wait(timeout=10)
        if pg_dump.returncode != 0:
            logger.error("pg_dump failed: %s", pg_dump.stderr.read().decode() if pg_dump.stderr else "")
            daily_file.unlink(missing_ok=True)
            return
        if gzip_proc.returncode != 0:
            logger.error("gzip failed: %s", gzip_err.decode() if gzip_err else "")
            daily_file.unlink(missing_ok=True)
            return

        size_mb = daily_file.stat().st_size / (1024 * 1024)
        logger.info("Backup created: %s (%.1f MB)", daily_file.name, size_mb)

        # Monthly backup on 1st of month
        if today.day == 1:
            monthly_file = backup_dir / f"monthly_{today.strftime('%Y-%m')}.sql.gz"
            import shutil
            shutil.copy2(str(daily_file), str(monthly_file))
            logger.info("Monthly backup: %s", monthly_file.name)

        # Rotate: keep 30 daily
        cutoff_daily = today - timedelta(days=30)
        for f in sorted(backup_dir.glob("daily_*.sql.gz")):
            try:
                fdate = date.fromisoformat(f.stem.replace("daily_", ""))
                if fdate < cutoff_daily:
                    f.unlink()
                    logger.info("Rotated old backup: %s", f.name)
            except (ValueError, OSError):
                pass

        # Rotate: keep 12 monthly
        monthly_files = sorted(backup_dir.glob("monthly_*.sql.gz"), reverse=True)
        for f in monthly_files[12:]:
            f.unlink()
            logger.info("Rotated old monthly backup: %s", f.name)

    except Exception as e:
        logger.error("pg_backup failed: %s", e, exc_info=True)


def job_weekly_ai_report():
    """Send weekly AI-powered report via Telegram (Sunday 20:00)."""
    logger.info("Running: weekly_ai_report")
    try:
        from src.database import set_current_user
        set_current_user("tpedchenko@gmail.com")

        from src.analytics import build_weekly_report_context
        from src.claude_ai import generate_telegram_report

        context = build_weekly_report_context()
        if not context:
            logger.warning("weekly_ai_report: no context data")
            return

        report = generate_telegram_report(context, period_type="week")
        if report:
            send_telegram_message(report)
            logger.info("Weekly AI report sent (%d chars).", len(report))
        else:
            # Fallback: send raw data
            send_telegram_message(f"📊 *Тижневий звіт (raw data)*\n\n{context[:3500]}")
            logger.info("Weekly AI report: fallback to raw data.")
    except Exception as e:
        logger.error("weekly_ai_report failed: %s", e, exc_info=True)


def job_monthly_ai_report():
    """Send monthly AI-powered report via Telegram (1st of month 10:00)."""
    logger.info("Running: monthly_ai_report")
    try:
        from datetime import date, timedelta
        from src.database import set_current_user
        set_current_user("tpedchenko@gmail.com")

        from src.analytics import build_monthly_report_context
        from src.claude_ai import generate_telegram_report

        prev_month = (date.today().replace(day=1) - timedelta(days=1)).strftime('%Y-%m')
        context = build_monthly_report_context(prev_month)
        if not context:
            logger.warning("monthly_ai_report: no context data")
            return

        report = generate_telegram_report(context, period_type="month")
        if report:
            send_telegram_message(report)
            logger.info("Monthly AI report sent for %s (%d chars).", prev_month, len(report))
        else:
            send_telegram_message(f"📊 *Місячний звіт {prev_month} (raw data)*\n\n{context[:3500]}")
            logger.info("Monthly AI report: fallback to raw data.")
    except Exception as e:
        logger.error("monthly_ai_report failed: %s", e, exc_info=True)


def job_generate_snapshots():
    """Generate weekly/monthly snapshots for AI context."""
    logger.info("Running: generate_snapshots")
    try:
        from datetime import date, timedelta
        from src.database import set_current_user
        set_current_user("tpedchenko@gmail.com")

        from src.analytics import build_weekly_snapshot, build_monthly_snapshot
        from src.database import upsert_snapshot

        today = date.today()

        # Weekly snapshot (for previous week)
        prev_week = (today - timedelta(days=7))
        week_key = prev_week.strftime('%G-W%V')
        content = build_weekly_snapshot(week_key)
        if content:
            upsert_snapshot("week", week_key, "all", content)
            logger.info("Weekly snapshot generated: %s", week_key)

        # Monthly snapshot (on 1st of month, for previous month)
        if today.day <= 3:
            prev_month = (today.replace(day=1) - timedelta(days=1)).strftime('%Y-%m')
            content = build_monthly_snapshot(prev_month)
            if content:
                upsert_snapshot("month", prev_month, "all", content)
                logger.info("Monthly snapshot generated: %s", prev_month)
    except Exception as e:
        logger.error("generate_snapshots failed: %s", e, exc_info=True)


PAGE_INSIGHT_PROMPTS = {
    "dashboard": "Analyze ALL user data (finances, health, fitness, nutrition). Compare this month vs last month. Give 3-5 actionable insights.",
    "finance": "Analyze financial data (transactions, budgets, account balances). Compare this month vs last month, YTD vs last year. Focus on spending trends, budget adherence, savings rate.",
    "investments": "Analyze investment portfolio (positions, NAV, P&L). Compare this month vs last month. Focus on portfolio performance, diversification, notable movers.",
    "gym": "Analyze gym/workout data (workouts, volume, 1RM, muscle recovery). Compare this month vs last month, this week vs last week. Focus on consistency, strength progress, recovery.",
    "exercises": "Analyze per-exercise progress (1RM, sets, reps history). Compare last 4 weeks vs previous 4 weeks. Focus on specific exercise improvements and stalls.",
    "my-day": "Analyze today's data: daily log, Garmin metrics, food intake, mood. Compare vs 7-day average. Focus on energy, activity, sleep, nutrition.",
}


def job_generate_ai_insights():
    """Generate AI insights per page using Ollama (nightly, 00:15 UTC)."""
    logger.info("Running: generate_ai_insights")
    import json
    import time
    import requests
    from datetime import date
    from src.database import set_current_user

    ollama_host = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434").rstrip("/v1").rstrip("/")

    # Check Ollama availability
    try:
        r = requests.get(f"{ollama_host}/api/tags", timeout=5)
        if r.status_code != 200:
            logger.error("Ollama not available: %s", r.status_code)
            return
    except Exception as e:
        logger.error("Ollama connection failed: %s", e)
        return

    # Process each user
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, email FROM users WHERE role IN ('owner', 'user')")
            users = cur.fetchall()
            cur.close()
    except Exception as e:
        logger.error("Failed to fetch users: %s", e)
        return

    today = date.today().isoformat()
    import re as _re

    for user_id, email in users:
        set_current_user(email)
        logger.info("Generating insights for user %s (%s)", user_id, email)

        # Build context
        try:
            from src.analytics import build_full_context
            context = build_full_context()
        except Exception as e:
            logger.warning("Context build failed for user %s: %s", user_id, e)
            context = "No data available"

        # Refresh pd-assistant model with fresh context
        try:
            modelfile = f'''FROM llama3.2:3b

PARAMETER temperature 0.4
PARAMETER num_ctx 4096

SYSTEM """You are a personal AI analyst. Analyze data and produce JSON array of insights.
Each insight: {{"domain":"...", "severity":"info|warning|action", "title":"...", "body":"...", "comparison":"vs previous: +/-X%"}}
Return ONLY the JSON array.

{context[:3000]}"""'''

            requests.post(f"{ollama_host}/api/create", json={
                "model": "pd-assistant", "modelfile": modelfile
            }, timeout=60)
            logger.info("pd-assistant model refreshed")
        except Exception as e:
            logger.warning("Model refresh failed: %s", e)

        # Check for user-customized prompts and locale
        user_locale = "uk"
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT key, value FROM user_preferences WHERE user_id=%s AND key LIKE 'insight_prompt_%%' OR (user_id=%s AND key = 'locale')",
                (user_id, user_id)
            )
            custom_prompts = {}
            for row in cur.fetchall():
                if row[0] == "locale":
                    user_locale = row[1]
                else:
                    custom_prompts[row[0].replace("insight_prompt_", "")] = row[1]
            cur.close()

        lang_names = {"uk": "Ukrainian", "en": "English", "es": "Spanish"}
        language = lang_names.get(user_locale, "Ukrainian")

        # Generate insights per page
        for page, default_prompt in PAGE_INSIGHT_PROMPTS.items():
            prompt = custom_prompts.get(page, default_prompt)
            logger.info("  → %s", page)
            start = time.time()

            try:
                r = requests.post(f"{ollama_host}/api/chat", json={
                    "model": "pd-assistant",
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": f"You are an AI analyst. {prompt}\nReturn ONLY a JSON array of 3-5 insights.\nEach insight: {{\"domain\":\"{page}\",\"severity\":\"info|warning|action\",\"title\":\"short title\",\"body\":\"1-2 sentences\"}}"},
                        {"role": "user", "content": f"Відповідай ТІЛЬКИ {language} мовою. Analyze:\n{context[:2500]}"},
                    ],
                }, timeout=180)

                elapsed_ms = int((time.time() - start) * 1000)

                if r.status_code != 200:
                    logger.warning("  Ollama returned %s for %s", r.status_code, page)
                    continue

                content = r.json().get("message", {}).get("content", "[]")
                m = _re.search(r'\[[\s\S]*\]', content)
                insights = json.loads(m.group(0)) if m else []

                with get_conn() as conn:
                    cur = conn.cursor()
                    cur.execute("""
                        INSERT INTO ai_insights (user_id, page, date, insights_json, prompt_used, model, generation_ms)
                        VALUES (%s, %s, %s, %s, %s, 'pd-assistant', %s)
                        ON CONFLICT (user_id, page, date) DO UPDATE SET
                            insights_json = EXCLUDED.insights_json,
                            prompt_used = EXCLUDED.prompt_used,
                            generation_ms = EXCLUDED.generation_ms,
                            created_at = NOW()
                    """, (user_id, page, today, json.dumps(insights), prompt, elapsed_ms))
                    cur.close()

                logger.info("  ✓ %s: %d insights in %dms", page, len(insights), elapsed_ms)

            except Exception as e:
                logger.warning("  ✗ %s failed: %s", page, e)
                continue

    logger.info("AI insights generation complete")


def job_refresh_views():
    """Refresh materialized views."""
    logger.info("Running: refresh_views")
    try:
        from src.materialized_views import refresh_views
        refresh_views()
    except Exception as e:
        logger.error("refresh_views failed: %s", e, exc_info=True)


def job_daily_demo_data():
    """Fill demo user data gaps (daily_log, garmin, transactions)."""
    logger.info("Running: daily_demo_data")
    try:
        from src.demo_data import fill_demo_data_gaps
        filled = fill_demo_data_gaps()
        if filled:
            logger.info("Demo data: filled %d days.", filled)
        else:
            logger.info("Demo data: no gaps to fill.")
    except Exception as e:
        logger.error("daily_demo_data failed: %s", e, exc_info=True)


def job_prod_to_dev_sync():
    """Sync user data from prod PostgreSQL to dev PostgreSQL."""
    logger.info("Running: prod_to_dev_sync")
    try:
        from deploy.nas.prod_to_dev_sync import run_sync
        stats = run_sync()
        logger.info(
            "prod_to_dev_sync done: %d tables, %d rows, %d errors",
            stats["tables"], stats["rows"], stats["errors"],
        )
    except Exception as e:
        logger.error("prod_to_dev_sync failed: %s", e, exc_info=True)


# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------

def main():
    scheduler = BlockingScheduler(timezone="UTC")

    scheduler.add_job(job_sync_garmin,    CronTrigger(minute="*/5",  hour="7-23"), id="sync_garmin")
    scheduler.add_job(job_sync_withings,  CronTrigger(minute="*/15"),              id="sync_withings")
    scheduler.add_job(job_sync_monobank,  CronTrigger(minute="*/10", hour="7-23"), id="sync_monobank")
    scheduler.add_job(job_sync_bunq,      CronTrigger(minute="*/10", hour="7-23"), id="sync_bunq")
    scheduler.add_job(job_daily_report,   CronTrigger(hour=21, minute=0),          id="daily_report")
    scheduler.add_job(job_weekly_report,  CronTrigger(day_of_week="mon", hour=10, minute=0), id="weekly_report")
    scheduler.add_job(job_mood_reminder,  CronTrigger(hour="12,18", minute=0),     id="mood_reminder")
    scheduler.add_job(job_pg_backup,      CronTrigger(hour=3, minute=0),           id="pg_backup")
    scheduler.add_job(job_refresh_views,  CronTrigger(minute="*/30"),              id="refresh_views")
    scheduler.add_job(job_daily_demo_data, CronTrigger(hour=2, minute=0),          id="daily_demo_data")
    scheduler.add_job(job_prod_to_dev_sync, IntervalTrigger(hours=2),             id="prod_to_dev_sync")

    # AI reports & snapshots
    scheduler.add_job(job_weekly_ai_report,  CronTrigger(day_of_week="sun", hour=20, minute=0), id="weekly_ai_report")
    scheduler.add_job(job_monthly_ai_report, CronTrigger(day=1, hour=10, minute=0),             id="monthly_ai_report")
    scheduler.add_job(job_generate_snapshots, CronTrigger(day_of_week="mon", hour=3, minute=30), id="generate_snapshots")
    scheduler.add_job(job_generate_ai_insights, CronTrigger(hour=0, minute=15), id="ai_insights")

    logger.info("Scheduler started with %d jobs.", len(scheduler.get_jobs()))
    for job in scheduler.get_jobs():
        logger.info("  %s: %s", job.id, job.trigger)

    # Graceful shutdown
    def _shutdown(signum, frame):
        logger.info("Shutting down scheduler...")
        scheduler.shutdown(wait=False)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    scheduler.start()


if __name__ == "__main__":
    main()
