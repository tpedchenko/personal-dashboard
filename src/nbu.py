"""
NBU (National Bank of Ukraine) exchange rate integration.
API: https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?date=YYYYMMDD&json
Rates are cached in the nbu_rates table to avoid repeated API calls.
"""
import requests
from datetime import date, timedelta
from typing import Callable
from functools import lru_cache

from src.database import get_shared_conn, get_conn
from src.db_backend import is_postgres

API_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?date={}&json"

# In-memory cache for API results (TTL managed by lru_cache size)
@lru_cache(maxsize=400)
def _fetch_from_api(date_str: str) -> dict[str, float] | None:
    """Fetch all rates for a given date from NBU API."""
    date_fmt = date_str.replace("-", "")
    try:
        resp = requests.get(API_URL.format(date_fmt), timeout=15)
        resp.raise_for_status()
        data = resp.json()
        rates = {item["cc"]: float(item["rate"]) for item in data if "cc" in item}
        return rates if rates else None
    except Exception:
        return None


def _cache_rates(date_str: str, rates: dict[str, float]):
    with get_shared_conn() as conn:
        for cc, rate in rates.items():
            if is_postgres():
                conn.execute(
                    "INSERT INTO nbu_rates (date, currency_code, rate) VALUES (%s, %s, %s) "
                    "ON CONFLICT (date, currency_code) DO UPDATE SET rate = EXCLUDED.rate",
                    (date_str, cc, rate),
                )
            else:
                conn.execute(
                    "INSERT OR REPLACE INTO nbu_rates (date, currency_code, rate) VALUES (?,?,?)",
                    (date_str, cc, rate),
                )


def get_rate(date_str: str, currency_code: str, fallback_days: int = 7) -> float | None:
    """
    Get UAH rate for 1 unit of currency_code on given date.
    Falls back up to fallback_days if the date has no data (weekends/holidays).
    """
    ph = "%s" if is_postgres() else "?"

    with get_shared_conn() as conn:
        row = conn.execute(
            f"SELECT rate FROM nbu_rates WHERE date={ph} AND currency_code={ph}",
            (date_str, currency_code),
        ).fetchone()
    if row:
        return row[0]

    # Fetch from API
    rates = _fetch_from_api(date_str)
    if rates:
        _cache_rates(date_str, rates)
        if currency_code in rates:
            return rates[currency_code]

    # Fallback: try previous days (weekends / holidays)
    d = date.fromisoformat(date_str)
    for _ in range(fallback_days):
        d -= timedelta(days=1)
        fallback_str = d.isoformat()
        with get_shared_conn() as conn:
            row = conn.execute(
                f"SELECT rate FROM nbu_rates WHERE date={ph} AND currency_code={ph}",
                (fallback_str, currency_code),
            ).fetchone()
        if row:
            return row[0]
        rates = _fetch_from_api(fallback_str)
        if rates:
            _cache_rates(fallback_str, rates)
            if currency_code in rates:
                return rates[currency_code]

    return None


def get_eur_rate(date_str: str) -> float | None:
    """UAH per 1 EUR on given date."""
    return get_rate(date_str, "EUR")


def get_usd_rate(date_str: str) -> float | None:
    """UAH per 1 USD on given date."""
    return get_rate(date_str, "USD")


def uah_to_eur(amount_uah: float, date_str: str) -> tuple[float, float] | tuple[None, None]:
    """Convert UAH amount to EUR. Returns (amount_eur, nbu_rate) or (None, None)."""
    rate = get_eur_rate(date_str)
    if rate and rate > 0:
        return round(amount_uah / rate, 2), rate
    return None, None


def usd_to_eur(amount_usd: float, date_str: str) -> tuple[float, float] | tuple[None, None]:
    """Convert USD amount to EUR using NBU cross-rate. Returns (amount_eur, usd_rate) or (None, None)."""
    rate_usd = get_usd_rate(date_str)
    rate_eur = get_eur_rate(date_str)
    if rate_usd and rate_eur and rate_eur > 0:
        amount_eur = round(amount_usd * rate_usd / rate_eur, 2)
        return amount_eur, rate_usd
    return None, None
