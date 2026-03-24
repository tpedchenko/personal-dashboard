"""Garmin Connect integration via garminconnect library.

Handles authentication (with MFA support), smart data sync, and DB storage
for Garmin health data: daily stats, activities, sleep, HRV, training, body composition.

Core sync logic lives in src.sync.garmin_sync and is shared with the scheduler.
This module provides the webapp-specific wrappers that use get_conn() / get_secret().
"""
import json
import time
import sqlite3
from datetime import date, timedelta
from pathlib import Path
from typing import Callable

import pandas as pd

from src.database import DB_PATH, get_conn, get_secret, read_sql, get_current_user_email, set_user_preference
from src.sync.garmin_sync import (
    _val,
    authenticate_garmin,
    GarminMFARequired,
    get_sync_date_range as _sync_get_date_range,
    sync_garmin_data,
    upsert_daily as _sync_upsert_daily,
    upsert_sleep as _sync_upsert_sleep,
    upsert_activities as _sync_upsert_activities,
    upsert_body_comp as _sync_upsert_body_comp,
    _safe_call,
    _sync_body_composition as _sync_body_comp_core,
)

_DEFAULT_DATA_DIR = Path(__file__).parent.parent / "data"


def _get_garth_dir() -> Path:
    """Return per-user garth session directory."""
    email = get_current_user_email()
    if email:
        safe = email.replace("@", "_at_").replace(".", "_")
        d = _DEFAULT_DATA_DIR / "users" / safe / ".garth"
        d.mkdir(parents=True, exist_ok=True)
        return d
    return _DEFAULT_DATA_DIR / ".garth"
_API_DELAY = 0.5  # seconds between API calls to avoid rate limiting


# _val is imported from src.sync.garmin_sync — re-exported for backward compatibility


# ─── Authentication ──────────────────────────────────────────────────────────

def _get_client(mfa_code: str | None = None):
    """Create and authenticate Garmin Connect client.

    Delegates to src.sync.garmin_sync.authenticate_garmin() for the core logic.
    If MFA is required and no mfa_code is provided, raises
    GarminMFARequired with the client + client_state for resume_login.
    """
    email = get_secret("garmin_email")
    password = get_secret("garmin_password")
    if not email or not password:
        raise ValueError("Garmin credentials not configured. Go to Settings → Integrations.")

    garth_dir = str(_get_garth_dir())
    return authenticate_garmin(email, password, garth_dir, mfa_code=mfa_code)


def complete_mfa_login(client, client_state: dict, mfa_code: str):
    """Complete MFA login using the original session and save tokens."""
    client.resume_login(client_state, mfa_code)
    _get_garth_dir().mkdir(parents=True, exist_ok=True)
    client.garth.dump(str(_get_garth_dir()))
    return client


# ─── Data exploration (staging) ──────────────────────────────────────────────

_EXPLORE_ENDPOINTS = [
    "get_stats", "get_sleep_data", "get_heart_rates", "get_hrv_data",
    "get_all_day_stress", "get_training_readiness", "get_training_status",
    "get_max_metrics", "get_steps_data", "get_respiration_data",
    "get_spo2_data", "get_fitnessage_data", "get_body_battery",
]


def explore_garmin_data(sample_date: str | None = None) -> dict:
    """Download raw data from all key endpoints for one day into garmin_staging.

    Returns summary: {endpoint: {keys: [...], status: "ok"|"empty"|"error"}}.
    """
    client = _get_client()
    if not sample_date:
        sample_date = (date.today() - timedelta(days=1)).isoformat()

    summary = {}

    with get_conn() as conn:
        # Clear old staging data for this date
        conn.execute("DELETE FROM garmin_staging WHERE date = ?", (sample_date,))

        # Per-date endpoints
        for endpoint in _EXPLORE_ENDPOINTS:
            try:
                method = getattr(client, endpoint)
                if endpoint in ("get_body_battery",):
                    data = method(sample_date, sample_date)
                else:
                    data = method(sample_date)
                if data:
                    raw = json.dumps(data, default=str, ensure_ascii=False)
                    conn.execute(
                        "INSERT INTO garmin_staging (endpoint, date, raw_json) VALUES (?, ?, ?)",
                        (endpoint, sample_date, raw),
                    )
                    keys = list(data.keys()) if isinstance(data, dict) else f"list[{len(data)}]"
                    summary[endpoint] = {"status": "ok", "keys": keys}
                else:
                    summary[endpoint] = {"status": "empty", "keys": []}
            except Exception as e:
                summary[endpoint] = {"status": "error", "error": str(e)[:100]}
            time.sleep(_API_DELAY)

        # Body composition (range endpoint)
        try:
            body = client.get_body_composition(sample_date, sample_date)
            if body:
                raw = json.dumps(body, default=str, ensure_ascii=False)
                conn.execute(
                    "INSERT INTO garmin_staging (endpoint, date, raw_json) VALUES (?, ?, ?)",
                    ("get_body_composition", sample_date, raw),
                )
                keys = list(body.keys()) if isinstance(body, dict) else f"list[{len(body)}]"
                summary["get_body_composition"] = {"status": "ok", "keys": keys}
            else:
                summary["get_body_composition"] = {"status": "empty", "keys": []}
        except Exception as e:
            summary["get_body_composition"] = {"status": "error", "error": str(e)[:100]}

        # Sample activities
        try:
            acts = client.get_activities(0, 3)
            if acts:
                raw = json.dumps(acts, default=str, ensure_ascii=False)
                conn.execute(
                    "INSERT INTO garmin_staging (endpoint, date, raw_json) VALUES (?, ?, ?)",
                    ("get_activities", sample_date, raw),
                )
                keys = list(acts[0].keys()) if acts else []
                summary["get_activities"] = {"status": "ok", "keys": keys, "sample_count": len(acts)}
            else:
                summary["get_activities"] = {"status": "empty", "keys": []}
        except Exception as e:
            summary["get_activities"] = {"status": "error", "error": str(e)[:100]}



    # Save session
    try:
        client.garth.dump(str(_get_garth_dir()))
    except Exception:
        pass

    return summary


# ─── Gap detection ───────────────────────────────────────────────────────────

def get_sync_date_range() -> dict:
    """Analyze what Garmin data we already have and what's missing.

    Delegates to src.sync.garmin_sync.get_sync_date_range() with a connection.
    """
    with get_conn() as conn:
        return _sync_get_date_range(conn)


# ─── Smart sync ──────────────────────────────────────────────────────────────

def sync_garmin_smart(
    progress_callback: Callable[[int, int, str], None] | None = None,
    mfa_code: str | None = None,
) -> dict:
    """Smart Garmin sync: auto-detects gaps, full history on first run.

    Delegates core sync logic to src.sync.garmin_sync.sync_garmin_data().
    Handles webapp-specific concerns: get_conn(), credential retrieval,
    and gym_initialized preference reset.

    Args:
        progress_callback: optional (current, total, message) for progress bar
        mfa_code: MFA code if needed for fresh login
    Returns:
        dict with counts: daily, activities, sleep, body_comp
    """
    client = _get_client(mfa_code=mfa_code)

    with get_conn() as conn:
        counts = sync_garmin_data(client, conn, progress_callback=progress_callback)

    # Reset gym_initialized so exercises are re-classified with new data
    if counts["activities"] > 0:
        email = get_current_user_email()
        if email:
            set_user_preference(email, "gym_initialized", "")

    # Save session
    try:
        client.garth.dump(str(_get_garth_dir()))
    except Exception:
        pass

    return counts


def _sync_body_composition(client, dates: list[date], counts: dict):
    """Sync body composition in 30-day windows covering the synced range.

    Webapp wrapper that opens a connection and delegates to shared logic.
    """
    with get_conn() as conn:
        _sync_body_comp_core(client, conn, dates, counts)


# ─── Upsert functions ────────────────────────────────────────────────────────

def _upsert_daily(d_str: str, stats: dict, hrv: dict | None,
                   training_readiness: dict | None, training_status: dict | None,
                   max_metrics: dict | None, fitness_age: dict | None):
    """Upsert daily summary — webapp wrapper that opens a connection.

    Delegates to src.sync.garmin_sync.upsert_daily().
    """
    with get_conn() as conn:
        _sync_upsert_daily(conn, d_str, stats, hrv, training_readiness,
                           training_status, max_metrics, fitness_age)



def _upsert_sleep(d_str: str, sleep_data: dict):
    """Upsert sleep data — webapp wrapper that opens a connection.

    Delegates to src.sync.garmin_sync.upsert_sleep().
    """
    with get_conn() as conn:
        _sync_upsert_sleep(conn, d_str, sleep_data)



def _upsert_activities(activities: list[dict]):
    """Upsert activities — webapp wrapper that opens a connection.

    Delegates to src.sync.garmin_sync.upsert_activities().
    """
    with get_conn() as conn:
        _sync_upsert_activities(conn, activities)



def _upsert_body_comp(d_str: str, data: dict):
    """Upsert body composition — webapp wrapper that opens a connection.

    Delegates to src.sync.garmin_sync.upsert_body_comp().
    """
    with get_conn() as conn:
        _sync_upsert_body_comp(conn, d_str, data)



# ─── Data queries ────────────────────────────────────────────────────────────

def get_garmin_daily(days: int = 30) -> pd.DataFrame:
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        df = read_sql(
            "SELECT * FROM garmin_daily WHERE date >= ? ORDER BY date", conn, [since]
        )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
    return df


def get_garmin_activities(days: int = 30) -> pd.DataFrame:
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        df = read_sql(
            "SELECT * FROM garmin_activities WHERE date >= ? ORDER BY date DESC", conn, [since]
        )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
    return df


def get_garmin_sleep(days: int = 30) -> pd.DataFrame:
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        df = read_sql(
            "SELECT * FROM garmin_sleep WHERE date >= ? ORDER BY date", conn, [since]
        )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
    return df


def get_garmin_body_composition(days: int = 365) -> pd.DataFrame:
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        df = read_sql(
            "SELECT * FROM garmin_body_composition WHERE date >= ? ORDER BY date",
            conn, [since],
        )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
    return df


def get_garmin_daily_count() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) FROM garmin_daily").fetchone()[0]
