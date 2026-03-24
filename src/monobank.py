"""Monobank API integration for syncing bank transactions."""

import time
import logging
from datetime import datetime, timedelta, timezone

import requests

from src.database import add_transaction, get_conn

log = logging.getLogger(__name__)

_BASE_URL = "https://api.monobank.ua"

# Currency ISO-4217 numeric codes
_CURRENCY_MAP: dict[int, str] = {
    980: "UAH",
    978: "EUR",
    840: "USD",
}

# ─── MCC → App category mapping ─────────────────────────────────────────────

# Maps MCC codes to (category, subcategory_hint) matching CATEGORY_TREE in database.py
# The returned value is the full category string as stored in DB (e.g. "Parent / Child")

_MCC_EXACT: dict[int, str] = {
    # Food & Groceries → Супермаркет
    5411: "Харчування і необхідне / Супермаркет",
    5462: "Харчування і необхідне / Супермаркет",
    5499: "Харчування і необхідне / Супермаркет",
    # Restaurants
    5812: "Відпочинок / ресторан та смаколики",
    5813: "Відпочинок / ресторан та смаколики",
    5814: "Відпочинок / ресторан та смаколики",
    # Pharmacy
    5912: "Медицина / Аптека",
    # Personal / beauty
    5977: "На себе",
    7230: "На себе",
    7298: "На себе",
    # Utilities
    4900: "Комуналка",
    # Entertainment
    7832: "Відпочинок",
    7922: "Відпочинок",
    7941: "Відпочинок",
    # Clothing / Shopping
    5311: "Shopping (не обов'язкове) / Одяг",
    5691: "Shopping (не обов'язкове) / Одяг",
    5699: "Shopping (не обов'язкове) / Одяг",
    # Gifts
    5944: "Подарунки",
    5945: "Подарунки",
    # Transfers / ATM
    6011: "хз виділені категорії",
    6012: "хз виділені категорії",
}

# MCC ranges for transport and medical
_MCC_RANGES: list[tuple[int, int, str]] = [
    (4111, 4131, "Транспорт"),
    (4789, 4789, "Транспорт"),
    (8011, 8099, "Медицина / Доктор"),
]

_DEFAULT_CATEGORY = "хз виділені категорії"


def mcc_to_category(mcc: int) -> str:
    """Map MCC code to app category string.

    Returns the category path as stored in the database
    (e.g. "Харчування і необхідне / Супермаркет").
    """
    # Exact match first
    if mcc in _MCC_EXACT:
        return _MCC_EXACT[mcc]

    # Range match
    for lo, hi, cat in _MCC_RANGES:
        if lo <= mcc <= hi:
            return cat

    return _DEFAULT_CATEGORY


# ─── Smart categorization (MCC + description patterns) ──────────────────────

_DESCRIPTION_PATTERNS: list[tuple[list[str], str]] = [
    # Supermarkets
    (["сільпо", "silpo", "атб", "фора", "metro", "новус", "ашан", "lidl", "mercadona", "carrefour", "aldi"],
     "Харчування і необхідне / Супермаркет"),
    # Transport
    (["uber", "bolt", "uklon", "таксі", "taxi", "bus", "metro", "автобус"],
     "Транспорт"),
    # Pharmacy
    (["аптека", "pharmacy", "подорожник", "аптечна"],
     "Медицина / Аптека"),
    # Restaurants/cafes
    (["mcdonald", "starbucks", "кава", "coffee", "піца", "pizza", "суші", "sushi", "ресторан", "кафе"],
     "Відпочинок / ресторан та смаколики"),
    # Subscriptions
    (["netflix", "spotify", "youtube", "apple.com", "google play", "hbo", "disney"],
     "Підписки / Стрімінг"),
    (["github", "notion", "figma", "openai", "anthropic", "aws", "azure", "digitalocean", "jetbrains"],
     "Підписки / Софт"),
    # Sport
    (["gym", "спорт", "fitness", "фітнес", "тренажер", "decathlon"],
     "Спорт / Зал"),
]


def smart_categorize(mcc: int, description: str) -> str:
    """Categorize a transaction using MCC code and description patterns.

    Description patterns override MCC for more precise categorization.
    """
    desc_lower = (description or "").lower()

    # Try description patterns first (more specific)
    for patterns, category in _DESCRIPTION_PATTERNS:
        if any(p in desc_lower for p in patterns):
            return category

    # Fall back to MCC
    return mcc_to_category(mcc)


# ─── API calls ───────────────────────────────────────────────────────────────

def get_client_info(token: str) -> dict:
    """Fetch client info from Monobank API.

    Returns dict with 'clientId', 'name', 'accounts' list, etc.
    Raises requests.HTTPError on failure.
    """
    resp = requests.get(
        f"{_BASE_URL}/personal/client-info",
        headers={"X-Token": token},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def get_statements(
    token: str, account_id: str, from_ts: int, to_ts: int
) -> list[dict]:
    """Fetch account statements for a time range.

    Monobank limits: max 31 days per request, 1 request per 60 seconds.
    Returns list of transaction dicts.
    Raises requests.HTTPError on failure.
    """
    resp = requests.get(
        f"{_BASE_URL}/personal/statement/{account_id}/{from_ts}/{to_ts}",
        headers={"X-Token": token},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


# ─── Sync logic ──────────────────────────────────────────────────────────────

def _external_id_exists(ext_id: str) -> bool:
    """Check if a transaction with this external_id already exists."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM transactions WHERE external_id = ?", (ext_id,)
        ).fetchone()
    return row is not None


def sync_monobank(
    token: str,
    account_id: str,
    days: int = 90,
    account_name: str = "Taras Mono",
    progress_callback=None,
) -> dict:
    """Sync Monobank transactions into the app database.

    Splits the requested period into 31-day chunks (Monobank API limit).
    Rate-limits requests to 1 per 61 seconds.

    For each transaction:
    - Skips if external_id already exists (deduplication)
    - Maps MCC to app category
    - Amount is in minor units (kopiyky) — divides by 100
    - Negative amount = EXPENSE, positive = INCOME
    - Currency determined from account info (980=UAH, 978=EUR, 840=USD)

    Args:
        token: Monobank API token
        account_id: Monobank account ID to sync
        days: Number of days to look back (default 90, max ~1 year)
        account_name: Account name to use in transactions (default "Taras Mono")
        progress_callback: Optional callback(current_chunk, total_chunks, message)

    Returns:
        dict with keys: synced, skipped, errors
    """
    from src.nbu import uah_to_eur, usd_to_eur

    # Determine account currency
    client_info = get_client_info(token)
    account_info = None
    for acc in client_info.get("accounts", []):
        if acc["id"] == account_id:
            account_info = acc
            break

    if account_info is None:
        raise ValueError(f"Account {account_id} not found in Monobank client info")

    currency_code = account_info.get("currencyCode", 980)
    currency_symbol = _CURRENCY_MAP.get(currency_code, "UAH")

    # Build time chunks (max 31 days each)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)

    chunks: list[tuple[int, int]] = []
    chunk_start = start
    while chunk_start < now:
        chunk_end = min(chunk_start + timedelta(days=31), now)
        chunks.append((
            int(chunk_start.timestamp()),
            int(chunk_end.timestamp()),
        ))
        chunk_start = chunk_end

    result = {"synced": 0, "skipped": 0, "errors": 0}

    for i, (from_ts, to_ts) in enumerate(chunks):
        if progress_callback:
            progress_callback(
                i, len(chunks),
                f"Fetching chunk {i + 1}/{len(chunks)}..."
            )

        # Rate limiting: wait 61 seconds between requests (except the first)
        if i > 0:
            if progress_callback:
                progress_callback(
                    i, len(chunks),
                    f"Rate limit: waiting 61s before chunk {i + 1}/{len(chunks)}..."
                )
            time.sleep(61)

        try:
            statements = get_statements(token, account_id, from_ts, to_ts)
        except requests.HTTPError as e:
            log.error("Failed to fetch statements for chunk %d: %s", i, e)
            result["errors"] += 1
            continue

        for tx in statements:
            tx_id = str(tx["id"])

            # Dedup check
            if _external_id_exists(tx_id):
                result["skipped"] += 1
                continue

            try:
                # Amount: in minor units (kopiyky/cents), negative = expense
                raw_amount = tx["amount"]  # in minor units with sign
                amount = abs(raw_amount) / 100.0
                tx_type = "EXPENSE" if raw_amount < 0 else "INCOME"

                # Date from Unix timestamp
                tx_time = tx.get("time", from_ts)
                tx_date = datetime.fromtimestamp(tx_time, tz=timezone.utc).strftime("%Y-%m-%d")

                # Category from MCC + description (smart)
                mcc = tx.get("mcc", 0)
                description = tx.get("description", "")
                comment = tx.get("comment", "")
                category = smart_categorize(mcc, description)
                if comment and comment != description:
                    description = f"{description} | {comment}" if description else comment

                # Currency conversion to EUR
                if currency_code == 978:  # EUR
                    amount_eur = amount
                    nbu_rate = 1.0
                elif currency_code == 980:  # UAH
                    eur_result = uah_to_eur(amount, tx_date)
                    amount_eur = eur_result[0] if eur_result[0] is not None else amount
                    nbu_rate = eur_result[1] if eur_result[1] is not None else 0.0
                elif currency_code == 840:  # USD
                    eur_result = usd_to_eur(amount, tx_date)
                    amount_eur = eur_result[0] if eur_result[0] is not None else amount
                    nbu_rate = eur_result[1] if eur_result[1] is not None else 0.0
                else:
                    amount_eur = amount
                    nbu_rate = 0.0

                add_transaction(
                    date=tx_date,
                    tx_type=tx_type,
                    account=account_name,
                    category=category,
                    amount_original=amount,
                    currency_original=currency_symbol,
                    amount_eur=amount_eur,
                    nbu_rate=nbu_rate,
                    description=description,
                    external_id=tx_id,
                    source="monobank",
                )
                result["synced"] += 1

            except Exception as e:
                log.error("Failed to process transaction %s: %s", tx_id, e)
                result["errors"] += 1

    if progress_callback:
        progress_callback(len(chunks), len(chunks), "Sync complete!")

    return result
