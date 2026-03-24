"""PD Bot — Telegram bot for Personal Dashboard.

This package re-exports the public API for backward compatibility:
  - run_bot()
  - is_bot_healthy()
  - get_bot_status()

All internal symbols (cmd_*, handle_*, config variables, etc.) are also
re-exported so that ``import src.telegram_bot as bot; bot.cmd_start`` and
similar patterns used in tests keep working.

Mutable config variables (TARAS_USER_ID, ALLOWED_USER_IDS, etc.) are proxied
via __getattr__/__setattr__ so that test code like ``bot.ALLOWED_USER_IDS = {111}``
correctly updates the canonical state in ``src.telegram_bot.config``.
"""
import logging
import importlib

# ─── Public API (immutable functions — safe to import directly) ──────────────
from src.telegram_bot.core import run_bot  # noqa: F401
from src.telegram_bot.config import is_bot_healthy, get_bot_status  # noqa: F401

# ─── Function re-exports for backward compatibility ──────────────────────────
from src.telegram_bot.config import (  # noqa: F401
    _touch_activity,
    get_categories,
    _load_allowed_users,
    _is_allowed,
    _get_account,
    _is_tatiana,
    _set_user_context,
    _resolve_currency,
)

from src.telegram_bot.handlers.commands import (  # noqa: F401
    cmd_myid, cmd_connect, cmd_start, cmd_help, cmd_mood, cmd_stats,
    cmd_garmin, cmd_cancel, cmd_task, cmd_tasks, cmd_budget, cmd_balance,
    cmd_week, cmd_list, cmd_buy, cmd_bought, cmd_health, cmd_goal,
    cmd_pr, cmd_food, cmd_eat, cmd_exp,
)

from src.telegram_bot.handlers.callbacks import (  # noqa: F401
    handle_category_callback, handle_shopping_report_callback,
    handle_food_callback,
)

from src.telegram_bot.handlers.messages import (  # noqa: F401
    handle_message, handle_voice, handle_photo,
    _process_text, _handle_analytics_or_chat,
    handle_shopping_group, handle_shopping_voice,
)

from src.telegram_bot.handlers.jobs import (  # noqa: F401
    _daily_report_job, _mood_reminder_job, _recurring_tx_job,
    _weekly_report_job, _anomaly_check_job, _auto_sync_job,
)

from src.telegram_bot.builders.finance import _get_financial_summary  # noqa: F401

# AI functions re-exported for test mock compatibility
from src.ai_client import (  # noqa: F401
    parse_transaction, chat_response, analyze_finances,
    analyze_food_photo, analyze_food_text,
)
from src.telegram_bot.builders.shopping import _build_shopping_report  # noqa: F401

from src.telegram_bot.core import BOT_COMMANDS, _post_init, _error_handler  # noqa: F401

# Provide a module-level logger for tests that patch `src.telegram_bot.logger`
logger = logging.getLogger("src.telegram_bot")

# ─── Mutable config proxy ────────────────────────────────────────────────────
# These variables live in config.py and are read by handlers.  Tests set them
# via ``bot.ALLOWED_USER_IDS = …`` so we proxy get/set to config module.

_CONFIG_VARS = {
    "TARAS_USER_ID", "TATIANA_USER_ID", "ALLOWED_USER_IDS",
    "ALLOWED_USERNAMES", "USER_ACCOUNTS", "USER_EMAILS",
    "SHOPPING_GROUP_ID", "CATEGORIES", "_HARDCODED_CATEGORIES",
    "_UAH_ACCOUNTS", "_bot_healthy", "_bot_start_time",
    "_last_activity", "_message_count",
}


def __getattr__(name):
    if name in _CONFIG_VARS:
        from src.telegram_bot import config as _cfg
        return getattr(_cfg, name)
    raise AttributeError(f"module 'src.telegram_bot' has no attribute {name!r}")


# Module-level __setattr__ for the proxy (Python 3.7+)
_real_module = importlib.import_module(__name__)


class _ModuleProxy:
    """Thin wrapper that intercepts setattr for config vars."""

    def __init__(self, module):
        object.__setattr__(self, '_module', module)

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, '_module'), name)

    def __setattr__(self, name, value):
        if name in _CONFIG_VARS:
            from src.telegram_bot import config as _cfg
            setattr(_cfg, name, value)
            return
        setattr(object.__getattribute__(self, '_module'), name, value)

    def __delattr__(self, name):
        delattr(object.__getattribute__(self, '_module'), name)

    def __repr__(self):
        return repr(object.__getattribute__(self, '_module'))


import sys
sys.modules[__name__] = _ModuleProxy(_real_module)
