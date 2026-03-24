"""bunq bank API integration for syncing bank transactions.

Uses bunq REST API directly (SDK 1.28.0 has deserialization bugs).
Supports OAuth2 flow (Client ID + Secret) and API key auth.
Pattern mirrors src/monobank.py for consistency.
"""

import json
import logging
import os
import secrets
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from src.database import add_transaction, get_conn, get_existing_external_ids, get_secret, set_secret

log = logging.getLogger(__name__)

# ─── API configuration ───────────────────────────────────────────────────────

BUNQ_API_BASE = "https://api.bunq.com"
BUNQ_AUTH_URL = "https://oauth.bunq.com/auth"
BUNQ_TOKEN_URL = "https://api.oauth.bunq.com/v1/token"

# ─── Description-based categorization (bunq has no MCC in payment objects) ────

_DESCRIPTION_PATTERNS: list[tuple[list[str], str]] = [
    # Supermarkets
    (["sільпо", "silpo", "атб", "фора", "metro", "новус", "ашан",
      "lidl", "mercadona", "carrefour", "aldi", "albert heijn", "ah ",
      "jumbo", "plus ", "dirk", "coop", "spar", "vomar", "hoogvliet",
      "colruyt", "delhaize", "ekoplaza"],
     "Харчування і необхідне / Супермаркет"),
    # Transport
    (["uber", "bolt", "uklon", "таксі", "taxi", "bus", "metro",
      "автобус", "ns ", "ov-chipkaart", "gvb", "ret "],
     "Транспорт"),
    # Pharmacy
    (["аптека", "pharmacy", "подорожник", "аптечна", "etos", "kruidvat"],
     "Медицина / Аптека"),
    # Restaurants/cafes
    (["mcdonald", "starbucks", "кава", "coffee", "піца", "pizza",
      "суші", "sushi", "ресторан", "кафе", "restaurant", "cafe",
      "thuisbezorgd", "deliveroo", "uber eats"],
     "Відпочинок / ресторан та смаколики"),
    # Subscriptions - streaming
    (["netflix", "spotify", "youtube", "apple.com", "google play",
      "hbo", "disney"],
     "Підписки / Стрімінг"),
    # Subscriptions - software
    (["github", "notion", "figma", "openai", "anthropic", "aws",
      "azure", "digitalocean", "jetbrains"],
     "Підписки / Софт"),
    # Sport
    (["gym", "спорт", "fitness", "фітнес", "тренажер", "decathlon",
      "basic-fit", "anytime fitness"],
     "Спорт / Зал"),
    # Utilities
    (["комуналка", "vattenfall", "eneco", "essent", "greenchoice",
      "vitens", "dunea", "waternet"],
     "Комуналка"),
]

_DEFAULT_CATEGORY = "хз виділені категорії"


def smart_categorize(description: str, counterparty: str = "") -> str:
    """Categorize transaction based on description and counterparty name."""
    text = f"{description} {counterparty}".lower()

    for patterns, category in _DESCRIPTION_PATTERNS:
        if any(p in text for p in patterns):
            return category

    return _DEFAULT_CATEGORY


# ─── OAuth2 flow ─────────────────────────────────────────────────────────────

def get_oauth_auth_url(client_id: str, redirect_uri: str) -> tuple[str, str]:
    """Build the bunq OAuth2 authorization URL.

    Returns (auth_url, state) — user should be redirected to auth_url.
    """
    state = secrets.token_urlsafe(32)
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    url = f"{BUNQ_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return url, state


def exchange_oauth_code(
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> str:
    """Exchange OAuth2 authorization code for an access token.

    Returns the access_token string.
    Raises Exception on failure.
    """
    resp = requests.post(
        BUNQ_TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "client_secret": client_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    if resp.status_code != 200:
        raise Exception(f"bunq token exchange failed (HTTP {resp.status_code}): {resp.text}")

    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise Exception(f"No access_token in response: {data}")

    return token


def get_oauth_redirect_uri() -> str:
    """Get the OAuth redirect URI for this app instance."""
    base = os.environ.get("APP_PUBLIC_URL", "https://pd.taras.cloud")
    return base.rstrip("/") + "/"


# ─── bunq REST API client (replaces broken SDK) ─────────────────────────────

def _get_session_path(user_suffix: str = "") -> str:
    """Get path for storing bunq session data."""
    data_dir = os.environ.get("DATA_DIR", "data")
    ctx_dir = os.path.join(data_dir, "bunq_contexts")
    os.makedirs(ctx_dir, exist_ok=True)
    suffix = f"_{user_suffix}" if user_suffix else ""
    return os.path.join(ctx_dir, f"bunq_session{suffix}.json")


def _save_session(session_data: dict, user_suffix: str = ""):
    """Save session data to file."""
    path = _get_session_path(user_suffix)
    with open(path, "w") as f:
        json.dump(session_data, f)


def _load_session(user_suffix: str = "") -> dict | None:
    """Load session data from file. Returns None if not found."""
    path = _get_session_path(user_suffix)
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def _bunq_request(method: str, endpoint: str, session_token: str,
                  data: dict = None) -> dict:
    """Make an authenticated request to bunq API."""
    url = f"{BUNQ_API_BASE}/v1/{endpoint}"
    headers = {
        "Content-Type": "application/json",
        "X-Bunq-Client-Authentication": session_token,
        "User-Agent": "PersonalDashboard/1.0",
    }
    if method == "GET":
        resp = requests.get(url, headers=headers, timeout=30)
    elif method == "POST":
        resp = requests.post(url, headers=headers, json=data or {}, timeout=30)
    else:
        raise ValueError(f"Unsupported method: {method}")

    if resp.status_code not in (200, 201):
        raise Exception(f"bunq API error {resp.status_code}: {resp.text[:500]}")

    return resp.json()


def _create_installation(api_key: str) -> tuple[str, int]:
    """Step 1: Create installation — register our public key with bunq.

    Returns (installation_token, installation_id).
    """
    # Generate a simple RSA key pair for signing (bunq requires it)
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    private_key_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()

    resp = requests.post(
        f"{BUNQ_API_BASE}/v1/installation",
        headers={"Content-Type": "application/json", "User-Agent": "PersonalDashboard/1.0"},
        json={"client_public_key": public_key_pem},
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise Exception(f"Installation failed: {resp.text[:500]}")

    response_data = resp.json().get("Response", [])
    installation_token = None
    installation_id = None
    for item in response_data:
        if "Token" in item:
            installation_token = item["Token"]["token"]
        if "Id" in item:
            installation_id = item["Id"]["id"]

    if not installation_token:
        raise Exception(f"No token in installation response: {response_data}")

    return installation_token, installation_id, private_key_pem, public_key_pem


def _register_device(installation_token: str, api_key: str) -> int:
    """Step 2: Register device-server."""
    resp = requests.post(
        f"{BUNQ_API_BASE}/v1/device-server",
        headers={
            "Content-Type": "application/json",
            "X-Bunq-Client-Authentication": installation_token,
            "User-Agent": "PersonalDashboard/1.0",
        },
        json={
            "description": "Personal Dashboard",
            "secret": api_key,
            "permitted_ips": ["*"],
        },
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise Exception(f"Device registration failed: {resp.text[:500]}")

    response_data = resp.json().get("Response", [])
    for item in response_data:
        if "Id" in item:
            return item["Id"]["id"]
    return 0


def _create_session(installation_token: str, api_key: str) -> tuple[str, int]:
    """Step 3: Create session — get session token and user ID."""
    resp = requests.post(
        f"{BUNQ_API_BASE}/v1/session-server",
        headers={
            "Content-Type": "application/json",
            "X-Bunq-Client-Authentication": installation_token,
            "User-Agent": "PersonalDashboard/1.0",
        },
        json={"secret": api_key},
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise Exception(f"Session creation failed: {resp.text[:500]}")

    response_data = resp.json().get("Response", [])
    session_token = None
    user_id = None
    display_name = None

    for item in response_data:
        if "Token" in item:
            session_token = item["Token"]["token"]
        # User can be UserPerson, UserCompany, or UserApiKey
        for key in ("UserPerson", "UserCompany", "UserApiKey", "UserPaymentServiceProvider"):
            if key in item:
                user_data = item[key]
                user_id = user_data.get("id")
                display_name = user_data.get("display_name", "bunq User")

    if not session_token:
        raise Exception(f"No session token in response: {response_data}")

    return session_token, user_id, display_name


def create_api_context(api_key: str, user_suffix: str = "") -> dict:
    """Create a new bunq API context (installation + device + session).

    Uses raw REST API instead of broken SDK.
    Returns dict with user info on success.
    """
    # Step 1: Installation
    installation_token, installation_id, private_key, public_key = _create_installation(api_key)

    # Step 2: Device registration
    _register_device(installation_token, api_key)

    # Step 3: Session
    session_token, user_id, display_name = _create_session(installation_token, api_key)

    # Save session for reuse
    session_data = {
        "api_key": api_key,
        "session_token": session_token,
        "user_id": user_id,
        "display_name": display_name,
        "installation_token": installation_token,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_session(session_data, user_suffix)

    return {"display_name": display_name or "bunq User", "id": user_id}


def _ensure_context(api_key: str, user_suffix: str = "") -> dict:
    """Ensure bunq session is active. Creates new if needed.

    Returns session_data dict with session_token, user_id, etc.
    """
    session = _load_session(user_suffix)
    if session and session.get("session_token"):
        # Check if session is still valid (bunq sessions last ~90 days)
        created = session.get("created_at", "")
        if created:
            try:
                created_dt = datetime.fromisoformat(created)
                age_days = (datetime.now(timezone.utc) - created_dt).days
                if age_days < 80:  # Refresh before 90-day expiry
                    return session
            except Exception:
                pass

    # Create new session
    info = create_api_context(api_key, user_suffix)
    return _load_session(user_suffix)


# ─── Account listing ─────────────────────────────────────────────────────────

def get_accounts(api_key: str, user_suffix: str = "") -> list[dict]:
    """Get list of bunq monetary accounts via REST API."""
    session = _ensure_context(api_key, user_suffix)
    session_token = session["session_token"]
    user_id = session["user_id"]

    data = _bunq_request("GET", f"user/{user_id}/monetary-account", session_token)
    response = data.get("Response", [])

    accounts = []
    for item in response:
        # Can be MonetaryAccountBank, MonetaryAccountJoint, MonetaryAccountSavings
        for key in ("MonetaryAccountBank", "MonetaryAccountJoint",
                     "MonetaryAccountSavings", "MonetaryAccountExternal"):
            if key in item:
                acc = item[key]
                if acc.get("status") != "ACTIVE":
                    continue

                balance = acc.get("balance", {})
                iban = ""
                for alias in acc.get("alias", []):
                    if alias.get("type") == "IBAN":
                        iban = alias.get("value", "")
                        break

                accounts.append({
                    "id": acc.get("id"),
                    "description": acc.get("description", f"Account {acc.get('id')}"),
                    "currency": balance.get("currency", "EUR"),
                    "balance": float(balance.get("value", 0)),
                    "iban": iban,
                    "status": acc.get("status"),
                })

    return accounts


# ─── Transaction fetching ────────────────────────────────────────────────────

def _fetch_payments(session_token: str, user_id: int, account_id: int,
                    since_date: str = None) -> list[dict]:
    """Fetch payments from a bunq account via REST API."""
    all_payments = []
    url = f"user/{user_id}/monetary-account/{account_id}/payment?count=100"

    while url:
        data = _bunq_request("GET", url, session_token)
        response = data.get("Response", [])

        if not response:
            break

        for item in response:
            p = item.get("Payment", {})
            tx_date = (p.get("created", "") or "")[:10]

            if since_date and tx_date < since_date:
                return all_payments  # Stop — we've gone past our date range

            amount_obj = p.get("amount", {})
            amount_val = float(amount_obj.get("value", 0))
            currency = amount_obj.get("currency", "EUR")

            counterparty = p.get("counterparty_alias", {})
            counterparty_name = ""
            counterparty_iban = ""
            if counterparty:
                counterparty_name = counterparty.get("display_name", "")
                if counterparty.get("type") == "IBAN":
                    counterparty_iban = counterparty.get("value", "")

            all_payments.append({
                "id": p.get("id"),
                "date": tx_date,
                "created": p.get("created", ""),
                "amount": amount_val,
                "currency": currency,
                "description": p.get("description", ""),
                "counterparty_name": counterparty_name,
                "counterparty_iban": counterparty_iban,
                "type": p.get("type", ""),
                "sub_type": p.get("sub_type", ""),
            })

        # Pagination: check for older page
        pagination = data.get("Pagination", {})
        older_url = pagination.get("older_url")
        if older_url:
            # older_url is like "/v1/user/123/monetary-account/456/payment?..."
            url = older_url.lstrip("/v1/").lstrip("/")
            time.sleep(1.1)  # Rate limit: max 3 GET per 3 seconds
        else:
            break

    return all_payments


# ─── Sync logic ──────────────────────────────────────────────────────────────

_CURRENCY_SYMBOLS = {"EUR": "€", "USD": "$", "GBP": "£"}


def sync_bunq(
    api_key: str,
    account_id: int,
    days: int = 90,
    account_name: str = "bunq",
    user_suffix: str = "",
    progress_callback=None,
) -> dict:
    """Sync bunq transactions into the app database."""
    from src.nbu import usd_to_eur

    session = _ensure_context(api_key, user_suffix)
    session_token = session["session_token"]
    user_id = session["user_id"]

    since_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    if progress_callback:
        progress_callback(0, 1, "Fetching payments from bunq...")

    try:
        payments = _fetch_payments(session_token, user_id, account_id, since_date=since_date)
    except Exception as e:
        log.error("Failed to fetch bunq payments: %s", e)
        if progress_callback:
            progress_callback(1, 1, f"Error: {e}")
        return {"synced": 0, "skipped": 0, "errors": 1}

    if progress_callback:
        progress_callback(0, len(payments) or 1, f"Processing {len(payments)} payments...")

    # Batch-load existing external IDs to avoid N+1 queries
    existing_ids = get_existing_external_ids("bunq_")

    result = {"synced": 0, "skipped": 0, "errors": 0}

    for i, p in enumerate(payments):
        ext_id = f"bunq_{p['id']}"

        if ext_id in existing_ids:
            result["skipped"] += 1
            continue

        try:
            amount = abs(p["amount"])
            tx_type = "EXPENSE" if p["amount"] < 0 else "INCOME"
            tx_date = p["date"]
            currency = p["currency"]
            currency_symbol = currency  # ISO code directly (EUR, USD, etc.)

            description = p["description"]
            if p["counterparty_name"] and p["counterparty_name"] not in description:
                description = f"{p['counterparty_name']}: {description}" if description else p["counterparty_name"]

            category = smart_categorize(p["description"], p["counterparty_name"])

            # Currency conversion to EUR
            if currency == "EUR":
                amount_eur = amount
                nbu_rate = 1.0
            elif currency == "USD":
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
                external_id=ext_id,
                source="bunq",
            )
            result["synced"] += 1

        except Exception as e:
            log.error("Failed to process bunq payment %s: %s", p["id"], e)
            result["errors"] += 1

        if progress_callback and i % 10 == 0:
            progress_callback(i, len(payments), f"Processed {i}/{len(payments)} payments...")

    if progress_callback:
        progress_callback(len(payments), len(payments), "Sync complete!")

    return result
