"""PD Bot configuration — constants, user mapping, health check state."""
import os
import logging

from telegram import Update

import src.database as _db

logger = logging.getLogger(__name__)

# ─── Health check state ──────────────────────────────────────────────────────
_bot_healthy = False
_bot_start_time: str | None = None
_last_activity: str | None = None
_message_count: int = 0


def _touch_activity():
    """Update last activity timestamp."""
    global _last_activity, _message_count
    from datetime import datetime
    _last_activity = datetime.now().isoformat()
    _message_count += 1


def is_bot_healthy() -> bool:
    """Check if bot is running."""
    return _bot_healthy


def get_bot_status() -> dict:
    """Get bot status for health endpoint."""
    return {
        "healthy": _bot_healthy,
        "started_at": _bot_start_time,
        "last_activity": _last_activity,
        "message_count": _message_count,
    }


# ─── User configuration ──────────────────────────────────────────────────────

# Taras user ID — main user
TARAS_USER_ID: int | None = None
# Tatiana user ID
TATIANA_USER_ID: int | None = None
# All allowed IDs
ALLOWED_USER_IDS: set[int] = set()
# Allowed usernames (fallback if IDs not configured)
ALLOWED_USERNAMES: set[str] = {"tapacp", "taba777"}

# Account mapping per user
USER_ACCOUNTS: dict[int, str] = {}
# Email mapping per user (for per-user DB routing)
USER_EMAILS: dict[int, str] = {}

# Shopping group chat ID (ТТ замовлення)
SHOPPING_GROUP_ID: int | None = None

# Hardcoded fallback categories
_HARDCODED_CATEGORIES = [
    "Харчування і необхідне", "Ресторан та смаколики", "Транспорт",
    "Медицина", "Відпочинок", "Shopping (не обов'язкове)", "Комуналка",
    "Навчання", "На себе", "Подарунки", "Доброчинність / на війну",
    "Bus", "Квартира Cordoba", "Будинок в Києві", "Маша", "Даша",
    "Таня на витрати", "Мама О",
]


def get_categories() -> list[str]:
    """Load categories from DB, fall back to hardcoded list."""
    try:
        cats = _db.get_categories()
        if cats:
            return cats
    except Exception:
        logger.debug("Could not load categories from DB, using hardcoded fallback")
    return list(_HARDCODED_CATEGORIES)


# Keep CATEGORIES as a module-level variable for backward compat,
# but it's initialised lazily via get_categories() where needed.
CATEGORIES = _HARDCODED_CATEGORIES


def _load_allowed_users():
    global TARAS_USER_ID, TATIANA_USER_ID, SHOPPING_GROUP_ID
    raw = os.getenv("TELEGRAM_ALLOWED_USERS", "")
    if raw:
        ALLOWED_USER_IDS.update(int(x.strip()) for x in raw.split(",") if x.strip())

    # Taras (env var fallback — primary source is now DB telegram_links)
    taras_id = os.getenv("TELEGRAM_TARAS_ID", "")
    if taras_id:
        TARAS_USER_ID = int(taras_id)
        ALLOWED_USER_IDS.add(TARAS_USER_ID)
        USER_ACCOUNTS[TARAS_USER_ID] = "Taras Mono"
        USER_EMAILS[TARAS_USER_ID] = "${OWNER_EMAIL:-admin@example.com}"

    # Tatiana (env var fallback)
    tatiana_id = os.getenv("TELEGRAM_TATIANA_ID", "")
    if tatiana_id:
        TATIANA_USER_ID = int(tatiana_id)
        ALLOWED_USER_IDS.add(TATIANA_USER_ID)
        USER_ACCOUNTS[TATIANA_USER_ID] = "Tatiana Sence"
        USER_EMAILS[TATIANA_USER_ID] = "tatiana@pd-app.local"

    # Load DB-based telegram links (overrides env vars)
    try:
        from src.database import get_telegram_links, init_shared_db
        init_shared_db()
        for link in get_telegram_links():
            tid = link["telegram_id"]
            if tid and tid > 0:
                ALLOWED_USER_IDS.add(tid)
                USER_EMAILS[tid] = link["user_email"]
                # Set TARAS_USER_ID if this is the owner
                if link["user_email"] == "${OWNER_EMAIL:-admin@example.com}":
                    TARAS_USER_ID = tid
    except Exception as e:
        logger.warning("Could not load telegram_links from DB: %s", e)

    # Shopping group (ТТ замовлення)
    group_id = os.getenv("TELEGRAM_SHOPPING_GROUP_ID", "")
    if group_id:
        SHOPPING_GROUP_ID = int(group_id)


def _is_allowed(update: Update) -> bool:
    user = update.effective_user
    if not user:
        return False
    allowed = False
    # Check by user ID (in-memory cache from env + DB)
    if ALLOWED_USER_IDS and user.id in ALLOWED_USER_IDS:
        allowed = True
    # Check by username (legacy fallback)
    elif user.username and user.username.lower() in ALLOWED_USERNAMES:
        ALLOWED_USER_IDS.add(user.id)
        if user.username.lower() == "tapacp":
            USER_ACCOUNTS[user.id] = "Taras Mono"
            USER_EMAILS[user.id] = "${OWNER_EMAIL:-admin@example.com}"
        elif user.username.lower() == "taba777":
            USER_ACCOUNTS[user.id] = "Tatiana Sence"
            USER_EMAILS[user.id] = "tatiana@pd-app.local"
        allowed = True
    else:
        # Dynamic DB lookup (for newly connected users)
        try:
            from src.database import get_telegram_link
            link = get_telegram_link(user.id)
            if link:
                ALLOWED_USER_IDS.add(user.id)
                USER_EMAILS[user.id] = link["user_email"]
                allowed = True
        except Exception:
            logger.debug("Dynamic DB lookup failed for user %d", user.id)
    # If no restrictions configured at all, allow
    if not allowed and not ALLOWED_USER_IDS and not ALLOWED_USERNAMES:
        allowed = True
    # Set per-user DB context for this handler
    if allowed:
        _set_user_context(user.id)
    return allowed


def _get_account(user_id: int) -> str:
    """Get default account for a user.

    Uses USER_ACCOUNTS mapping first. If no mapping exists,
    falls back to the user's first active custom account from DB.
    """
    mapped = USER_ACCOUNTS.get(user_id)
    if mapped:
        return mapped
    # Fallback: first active account from custom_accounts
    try:
        account_names = _db.get_account_names()
        if account_names:
            return account_names[0]
    except Exception:
        logger.debug("Could not load account names from DB for user %d", user_id)
    return "Main EUR"


def _is_tatiana(user_id: int) -> bool:
    if TATIANA_USER_ID is not None and user_id == TATIANA_USER_ID:
        return True
    return USER_ACCOUNTS.get(user_id) == "Tatiana Sence"


def _set_user_context(user_id: int):
    """Set per-user DB context for the current handler."""
    from src.database import set_current_user, init_db, init_shared_db
    email = USER_EMAILS.get(user_id)
    if email is None:
        raise ValueError(f"No email mapping for Telegram user_id={user_id}. "
                         "User must /connect first.")
    set_current_user(email)
    init_shared_db()
    init_db()


_UAH_ACCOUNTS = {"Taras Mono", "Taras Sence"}


def _resolve_currency(account: str, amount: float, tx_date: str):
    """Return (currency, amount_eur, nbu_rate) based on account type."""
    import math
    if amount is None or math.isinf(amount) or math.isnan(amount):
        raise ValueError(f"Invalid amount: {amount}")
    if account in _UAH_ACCOUNTS:
        from src.nbu import uah_to_eur
        amount_eur, rate = uah_to_eur(amount, tx_date)
        if amount_eur is not None and not (math.isinf(amount_eur) or math.isnan(amount_eur)):
            return "₴", amount_eur, rate
        return "₴", round(amount / 44.5, 2), 44.5  # fallback
    return "€", amount, 1.0
