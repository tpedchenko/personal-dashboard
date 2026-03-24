"""Withings Smart Body Analyser integration via direct HTTP API.

Uses direct requests to Withings API — no withings-api library needed.
OAuth2 authorization is also implemented via direct HTTP requests.

Core sync logic lives in src.sync.withings_sync and is shared with the scheduler.
This module provides the webapp-specific wrappers that use get_conn() / get_secret().
"""
import json
import os
from datetime import date, timedelta, datetime
from pathlib import Path
from urllib.parse import urlencode

import requests
import pandas as pd

from src.database import get_conn, get_secret, set_secret, read_sql
from src.sync.withings_sync import (
    refresh_withings_token,
    api_call as _sync_api_call,
    process_measure_groups as _sync_process_measure_groups,
    upsert_measurement as _sync_upsert_measurement,
    sync_withings_measurements as _sync_withings_measurements,
)

_API_BASE = "https://wbsapi.withings.net"
_API_TIMEOUT = 30  # seconds — prevent blocking on slow API responses


# ─── OAuth2 ──────────────────────────────────────────────────────────────────

def _get_callback_uri() -> str:
    return os.getenv("WITHINGS_CALLBACK_URI", "http://localhost:8501/callback")


def get_authorize_url() -> str:
    """Generate OAuth2 authorization URL for user to visit."""
    client_id = get_secret("withings_client_id")
    if not client_id:
        raise ValueError("Withings Client ID not configured.")
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": _get_callback_uri(),
        "scope": "user.metrics,user.info,user.activity",
        "state": "withings_auth",
    }
    return f"https://account.withings.com/oauth2_user/authorize2?{urlencode(params)}"


def exchange_code(code: str) -> bool:
    """Exchange authorization code for access/refresh tokens."""
    client_id = get_secret("withings_client_id")
    client_secret = get_secret("withings_client_secret")
    if not client_id or not client_secret:
        raise ValueError("Withings credentials not configured.")

    resp = requests.post(f"{_API_BASE}/v2/oauth2", data={
        "action": "requesttoken",
        "grant_type": "authorization_code",
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": _get_callback_uri(),
    }, timeout=_API_TIMEOUT)
    data = resp.json()
    if data.get("status") != 0:
        raise ValueError(f"OAuth error: {data}")

    body = data["body"]
    _save_tokens_dict({
        "access_token": body["access_token"],
        "refresh_token": body["refresh_token"],
        "token_type": body.get("token_type", "Bearer"),
        "expires_in": body.get("expires_in", 10800),
        "userid": body["userid"],
        "client_id": client_id,
        "consumer_secret": client_secret,
    })
    return True


def _save_tokens_dict(data: dict):
    """Save OAuth tokens to per-user DB secrets."""
    set_secret("withings_tokens", json.dumps(data))


def _load_tokens() -> dict:
    """Load OAuth tokens from per-user DB secrets."""
    raw = get_secret("withings_tokens")
    if not raw:
        raise ValueError(
            "Withings not connected. Complete OAuth authorization in Settings."
        )
    return json.loads(raw)


def is_connected() -> bool:
    """Check if Withings OAuth tokens exist in per-user DB."""
    return bool(get_secret("withings_tokens"))


def _refresh_token() -> str:
    """Refresh access token using refresh token. Returns new access token."""
    tokens = _load_tokens()
    client_id = tokens.get("client_id") or get_secret("withings_client_id")
    client_secret = tokens.get("consumer_secret") or get_secret("withings_client_secret")

    resp = requests.post(f"{_API_BASE}/v2/oauth2", data={
        "action": "requesttoken",
        "grant_type": "refresh_token",
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": tokens["refresh_token"],
    }, timeout=_API_TIMEOUT)
    data = resp.json()
    if data.get("status") != 0:
        # Clear stale tokens so user is prompted to re-authorize
        set_secret("withings_tokens", "")
        raise ValueError(
            "Token refresh failed — please re-authorize Withings in Settings."
        )

    body = data["body"]
    tokens["access_token"] = body["access_token"]
    tokens["refresh_token"] = body["refresh_token"]
    tokens["expires_in"] = body.get("expires_in", 10800)
    _save_tokens_dict(tokens)
    return body["access_token"]


def _api_call(endpoint: str, params: dict) -> dict:
    """Make authenticated API call with auto-refresh.

    Delegates to src.sync.withings_sync.api_call() with webapp's token refresh.
    """
    tokens = _load_tokens()
    return _sync_api_call(tokens["access_token"], endpoint, params,
                          refresh_func=_refresh_token)


# ─── Measure types (from Withings API docs) ──────────────────────────────────
_MTYPE_WEIGHT = 1
_MTYPE_FAT_RATIO = 6
_MTYPE_FAT_MASS = 8
_MTYPE_FAT_FREE_MASS = 5
_MTYPE_HEART_RATE = 11
_MTYPE_BONE_MASS = 88
_MTYPE_MUSCLE_MASS = 76


# ─── Sync ────────────────────────────────────────────────────────────────────

def _process_measure_groups(groups: list) -> int:
    """Process measuregrps list, upsert to DB. Returns count of upserted days.

    Webapp wrapper that opens a connection and delegates to shared logic.
    """
    with get_conn() as conn:
        return _sync_process_measure_groups(conn, groups)


def sync_withings_smart() -> dict:
    """Smart Withings sync: full history on first run, incremental after.

    Delegates core sync logic to src.sync.withings_sync.sync_withings_measurements().
    Handles webapp-specific concerns: get_conn(), credential retrieval.
    """
    tokens = _load_tokens()
    access_token = tokens["access_token"]

    def _do_refresh():
        """Refresh token using webapp's credential store."""
        return _refresh_token()

    with get_conn() as conn:
        return _sync_withings_measurements(access_token, conn,
                                            refresh_func=_do_refresh)


def sync_withings_data(days: int = 30) -> dict:
    """Legacy sync — delegates to smart sync."""
    return sync_withings_smart()


def _upsert_measurement(date_str: str, values: dict):
    """Insert or update a single day of body measurements.

    Webapp wrapper that opens a connection and delegates to shared logic.
    """
    with get_conn() as conn:
        _sync_upsert_measurement(conn, date_str, values)



# ─── Data queries ────────────────────────────────────────────────────────────

def get_withings_measurements(days: int = 90) -> pd.DataFrame:
    """Get body measurements for last N days."""
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        df = read_sql(
            "SELECT * FROM withings_measurements WHERE date >= ? ORDER BY date",
            conn, [since]
        )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
    return df


def get_withings_latest() -> dict | None:
    """Get most recent measurement."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT date, weight, fat_ratio, fat_mass, fat_free_mass, heart_rate, bmi "
            "FROM withings_measurements ORDER BY date DESC LIMIT 1"
        ).fetchone()
    if row is None:
        return None
    return {
        "date": row[0], "weight": row[1], "fat_ratio": row[2],
        "fat_mass": row[3], "fat_free_mass": row[4],
        "heart_rate": row[5], "bmi": row[6],
    }


def get_withings_count() -> int:
    """Return total number of stored measurements."""
    with get_conn() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM withings_measurements"
        ).fetchone()[0]
