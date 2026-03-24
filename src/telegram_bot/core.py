"""PD Bot core — run_bot(), command registration, error handler."""
import asyncio
import os
import logging
import threading

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters,
)

from src.database import init_db

import src.telegram_bot.config as config
from src.telegram_bot.config import (
    _load_allowed_users, ALLOWED_USER_IDS, SHOPPING_GROUP_ID,
)
from src.telegram_bot.handlers.commands import (
    cmd_myid, cmd_connect, cmd_start, cmd_help, cmd_mood, cmd_stats,
    cmd_garmin, cmd_cancel, cmd_task, cmd_tasks, cmd_budget, cmd_balance,
    cmd_week, cmd_list, cmd_buy, cmd_bought, cmd_health, cmd_goal,
    cmd_pr, cmd_food, cmd_eat, cmd_exp,
)
from src.telegram_bot.handlers.callbacks import (
    handle_category_callback, handle_shopping_report_callback,
    handle_food_callback,
)
from src.telegram_bot.handlers.messages import (
    handle_message, handle_voice, handle_photo,
    handle_shopping_group, handle_shopping_voice,
)

logger = logging.getLogger(__name__)

# ─── Bot commands menu (registered via setMyCommands) ────────────────────────
BOT_COMMANDS = [
    ("start", "Привітання та інфо"),
    ("exp", "Додати витрату: /exp 50 кава"),
    ("stats", "Статистика за місяць"),
    ("balance", "Баланси рахунків"),
    ("budget", "Бюджет по категоріях"),
    ("week", "Витрати за тиждень"),
    ("cancel", "Видалити останню транзакцію"),
    ("mood", "Записати настрій: /mood 3"),
    ("health", "Дані здоров'я (Garmin)"),
    ("garmin", "Останні дані Garmin"),
    ("food", "Щоденник їжі"),
    ("eat", "Додати їжу: /eat 2 яйця"),
    ("pr", "Персональні рекорди (зал)"),
    ("goal", "Прогрес накопичень"),
    ("list", "Список покупок"),
    ("buy", "Додати до списку: /buy хліб, молоко"),
    ("bought", "Все куплено"),
    ("help", "Список команд"),
    ("myid", "Показати Telegram ID"),
    ("connect", "Прив'язати до акаунту"),
]


async def _post_init(application: Application):
    """Register bot commands menu in Telegram."""
    from telegram import BotCommand
    commands = [BotCommand(cmd, desc) for cmd, desc in BOT_COMMANDS]
    await application.bot.set_my_commands(commands)
    logger.info("Bot commands menu registered (%d commands)", len(commands))


async def _error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):
    """Global error handler — log and notify user."""
    logger.error("Bot exception: %s", context.error, exc_info=context.error)
    if isinstance(update, Update) and update.effective_message:
        try:
            await update.effective_message.reply_text(
                "Щось пішло не так. Спробуй ще раз."
            )
        except Exception:
            logger.debug("Failed to send error reply to user")


def _run_bot_in_thread(app: Application, *, mode: str, **kwargs):
    """Run the bot in a non-main thread without signal handlers.

    Application.run_webhook/run_polling call add_signal_handler() which raises
    RuntimeError('set_wakeup_fd only works in main thread').  This function
    drives the same async lifecycle manually, skipping signal registration.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(app.initialize())
        if app.post_init:
            loop.run_until_complete(app.post_init(app))

        if mode == "webhook":
            loop.run_until_complete(app.updater.start_webhook(**kwargs))
        else:
            loop.run_until_complete(app.updater.start_polling(**kwargs))

        loop.run_until_complete(app.start())
        # Block until the loop is stopped (e.g. by app.stop())
        loop.run_forever()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Bot received shutdown signal")
    finally:
        try:
            if app.updater.running:
                loop.run_until_complete(app.updater.stop())
            if app.running:
                loop.run_until_complete(app.stop())
            loop.run_until_complete(app.shutdown())
            if app.post_shutdown:
                loop.run_until_complete(app.post_shutdown(app))
        except Exception:
            logger.debug("Error during bot shutdown", exc_info=True)
        finally:
            loop.close()


def run_bot():
    """Start the Telegram bot (webhook or polling mode).

    Webhook mode: set WEBHOOK_URL env var (e.g. https://pd.taras.cloud/bot-webhook).
    Polling mode: leave WEBHOOK_URL empty (fallback).
    """
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    # Try loading from DB (admin secret) if env var not set
    if not token:
        try:
            from src.database import init_shared_db, get_shared_conn
            init_shared_db()
            with get_shared_conn() as conn:
                row = conn.execute(
                    "SELECT s.value FROM secrets s "
                    "JOIN users u ON u.id = s.user_id "
                    "WHERE s.key = 'telegram_bot_token_admin' AND u.role = 'owner' "
                    "LIMIT 1"
                ).fetchone()
                if row and row[0]:
                    try:
                        from src.encryption import decrypt_value
                        token = decrypt_value(row[0])
                    except Exception:
                        token = row[0]
        except Exception as e:
            logger.debug("Could not load bot token from DB: %s", e)
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN not set — bot will not start")
        return

    _load_allowed_users()
    init_db()

    app = Application.builder().token(token).build()

    # Ack reaction on all incoming messages (group -1 = runs before other handlers)
    async def _ack_all(update: Update, context: ContextTypes.DEFAULT_TYPE):
        """React with 👀 to every incoming message as acknowledgment."""
        if update.message:
            try:
                from telegram import ReactionTypeEmoji
                await update.message.set_reaction([ReactionTypeEmoji(emoji="👀")])
            except Exception:
                pass
    app.add_handler(MessageHandler(filters.ALL, _ack_all), group=-1)

    # Commands
    app.add_handler(CommandHandler("myid", cmd_myid))
    app.add_handler(CommandHandler("connect", cmd_connect))
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("mood", cmd_mood))
    app.add_handler(CommandHandler("stats", cmd_stats))
    app.add_handler(CommandHandler("garmin", cmd_garmin))
    app.add_handler(CommandHandler("cancel", cmd_cancel))
    app.add_handler(CommandHandler("task", cmd_task))
    app.add_handler(CommandHandler("tasks", cmd_tasks))
    app.add_handler(CommandHandler("budget", cmd_budget))
    app.add_handler(CommandHandler("balance", cmd_balance))
    app.add_handler(CommandHandler("week", cmd_week))
    app.add_handler(CommandHandler("list", cmd_list))
    app.add_handler(CommandHandler("buy", cmd_buy))
    app.add_handler(CommandHandler("bought", cmd_bought))
    app.add_handler(CommandHandler("health", cmd_health))
    app.add_handler(CommandHandler("goal", cmd_goal))
    app.add_handler(CommandHandler("pr", cmd_pr))
    app.add_handler(CommandHandler("food", cmd_food))
    app.add_handler(CommandHandler("eat", cmd_eat))
    app.add_handler(CommandHandler("exp", cmd_exp))

    # Callback queries (inline keyboard)
    app.add_handler(CallbackQueryHandler(handle_category_callback, pattern="^cat:"))
    app.add_handler(CallbackQueryHandler(handle_shopping_report_callback, pattern="^shop:"))
    app.add_handler(CallbackQueryHandler(handle_food_callback, pattern="^food:"))

    # Shopping group handlers (must be before general handlers, use group filter)
    if SHOPPING_GROUP_ID:
        _shop_filter = filters.Chat(chat_id=SHOPPING_GROUP_ID)
        app.add_handler(MessageHandler(
            _shop_filter & (filters.VOICE | filters.AUDIO),
            handle_shopping_voice,
        ))
        app.add_handler(MessageHandler(
            _shop_filter & filters.TEXT & ~filters.COMMAND,
            handle_shopping_group,
        ))

    # Photo messages (food tracking)
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))

    # Voice messages (private)
    app.add_handler(MessageHandler(filters.VOICE | filters.AUDIO, handle_voice))

    # Text messages (private)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Scheduled jobs are handled by pd-scheduler container (scheduler.py)
    logger.info("Scheduled jobs handled by pd-scheduler container")

    app.add_error_handler(_error_handler)
    app.post_init = _post_init

    config._bot_healthy = True
    from datetime import datetime
    config._bot_start_time = datetime.now().isoformat()

    # Webhook or polling
    # Use manual async lifecycle instead of app.run_webhook/run_polling
    # to avoid set_wakeup_fd errors when running in non-main threads.
    _is_main_thread = threading.current_thread() is threading.main_thread()

    webhook_url = os.getenv("WEBHOOK_URL")
    if webhook_url:
        webhook_path = "/bot-webhook"
        port = int(os.getenv("BOT_WEBHOOK_PORT", "8443"))
        logger.info("PD Bot starting (webhook) — %s, port %d, %d handlers, %d users",
                    webhook_url, port, len(app.handlers.get(0, [])), len(ALLOWED_USER_IDS))
        if _is_main_thread:
            app.run_webhook(
                listen="0.0.0.0",
                port=port,
                url_path=webhook_path,
                webhook_url=webhook_url + webhook_path,
                drop_pending_updates=True,
            )
        else:
            _run_bot_in_thread(app, mode="webhook", listen="0.0.0.0",
                               port=port, url_path=webhook_path,
                               webhook_url=webhook_url + webhook_path,
                               drop_pending_updates=True)
    else:
        logger.info("PD Bot starting (polling) — %d handlers, %d users allowed",
                    len(app.handlers.get(0, [])), len(ALLOWED_USER_IDS))
        if _is_main_thread:
            app.run_polling(drop_pending_updates=True)
        else:
            _run_bot_in_thread(app, mode="polling", drop_pending_updates=True)
