"""Core Withings sync logic shared between webapp and NAS scheduler.

All functions accept database connections and tokens as parameters instead of
calling get_conn()/get_secret() internally. This makes them usable with both
SQLite (webapp) and psycopg2 (scheduler).
"""
from datetime import date, datetime, timedelta

import requests

_API_BASE = "https://wbsapi.withings.net"
_API_TIMEOUT = 30  # seconds

# Withings measure type codes
_MTYPE_WEIGHT = 1
_MTYPE_FAT_RATIO = 6
_MTYPE_FAT_MASS = 8
_MTYPE_FAT_FREE_MASS = 5
_MTYPE_HEART_RATE = 11
_MTYPE_BONE_MASS = 88
_MTYPE_MUSCLE_MASS = 76


# ---------------------------------------------------------------------------
# Portable SQL execution (same approach as garmin_sync)
# ---------------------------------------------------------------------------

def _exec(conn, sql, params=()):
    """Execute SQL portably on both SQLite and psycopg2 connections."""
    mod = type(conn).__module__
    if "psycopg2" in mod or "psycopg" in mod:
        sql = sql.replace("?", "%s")
        with conn.cursor() as cur:
            cur.execute(sql, params)
            try:
                return cur.fetchall()
            except Exception:
                return []
    else:
        cur = conn.execute(sql, params)
        return cur.fetchall()


def _fetchone(conn, sql, params=()):
    """Execute SQL and return a single row, or None."""
    mod = type(conn).__module__
    if "psycopg2" in mod or "psycopg" in mod:
        sql = sql.replace("?", "%s")
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()
    else:
        return conn.execute(sql, params).fetchone()


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------

def refresh_withings_token(tokens: dict, client_id: str,
                           client_secret: str) -> dict:
    """Refresh Withings OAuth access token.

    Args:
        tokens: dict with at least 'refresh_token' key
        client_id: Withings OAuth client ID
        client_secret: Withings OAuth client secret

    Returns:
        Updated tokens dict with new access_token, refresh_token, expires_in.

    Raises:
        ValueError: if token refresh fails.
    """
    resp = requests.post(f"{_API_BASE}/v2/oauth2", data={
        "action": "requesttoken",
        "grant_type": "refresh_token",
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": tokens["refresh_token"],
    }, timeout=_API_TIMEOUT)
    data = resp.json()

    if data.get("status") != 0:
        raise ValueError(
            f"Withings token refresh failed: status={data.get('status')}, "
            f"error={data.get('error')}"
        )

    body = data["body"]
    tokens["access_token"] = body["access_token"]
    tokens["refresh_token"] = body["refresh_token"]
    tokens["expires_in"] = body.get("expires_in", 10800)
    return tokens


# ---------------------------------------------------------------------------
# Authenticated API call with auto-refresh
# ---------------------------------------------------------------------------

def api_call(access_token: str, endpoint: str, params: dict,
             refresh_func=None) -> dict:
    """Make authenticated Withings API call.

    Args:
        access_token: current OAuth access token
        endpoint: API endpoint path (e.g. "measure")
        params: request parameters dict
        refresh_func: optional callable() that returns a new access_token
                      on 401 (token expired). If None, 401 raises.

    Returns:
        Response body dict.

    Raises:
        ValueError: on API error.
    """
    headers = {"Authorization": f"Bearer {access_token}"}

    resp = requests.post(f"{_API_BASE}/{endpoint}", data=params,
                         headers=headers, timeout=_API_TIMEOUT)
    data = resp.json()

    # Token expired -- refresh and retry
    if data.get("status") == 401 and refresh_func is not None:
        new_token = refresh_func()
        headers["Authorization"] = f"Bearer {new_token}"
        resp = requests.post(f"{_API_BASE}/{endpoint}", data=params,
                             headers=headers, timeout=_API_TIMEOUT)
        data = resp.json()

    if data.get("status") != 0:
        raise ValueError(
            f"Withings API error ({endpoint}): status={data.get('status')}, "
            f"error={data.get('error')}"
        )

    return data.get("body", {})


# ---------------------------------------------------------------------------
# Measurement processing
# ---------------------------------------------------------------------------

def process_measure_groups(conn, groups: list) -> int:
    """Process Withings measuregrps list and upsert to DB.

    Args:
        conn: database connection
        groups: list of measurement group dicts from Withings API

    Returns:
        Count of upserted measurement days.
    """
    count = 0
    for group in groups:
        grp_date = group.get("date", 0)
        if isinstance(grp_date, int):
            meas_date = datetime.fromtimestamp(grp_date).date().isoformat()
        else:
            meas_date = str(grp_date)[:10]

        values = {}
        for m in group.get("measures", []):
            real_value = m["value"] * (10 ** m["unit"])
            mtype = m["type"]
            if mtype == _MTYPE_WEIGHT:
                values["weight"] = round(real_value, 2)
            elif mtype == _MTYPE_FAT_RATIO:
                values["fat_ratio"] = round(real_value, 2)
            elif mtype == _MTYPE_FAT_MASS:
                values["fat_mass"] = round(real_value, 2)
            elif mtype == _MTYPE_FAT_FREE_MASS:
                values["fat_free_mass"] = round(real_value, 2)
            elif mtype == _MTYPE_HEART_RATE:
                values["heart_rate"] = int(real_value)

        if values:
            if "weight" in values:
                # Use user's height from preferences, fallback to 1.80m
                try:
                    from src.database import get_user_preference, get_current_user_email
                    _email = get_current_user_email()
                    _h = get_user_preference(_email, "height_m") if _email else None
                    height = float(_h) if _h else 1.80
                except Exception:
                    height = 1.80
                values["bmi"] = round(values["weight"] / (height ** 2), 1)
            upsert_measurement(conn, meas_date, values)
            count += 1
    return count


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

def upsert_measurement(conn, date_str: str, values: dict):
    """Insert or update a single day of body measurements.

    Args:
        conn: database connection
        date_str: date string (YYYY-MM-DD)
        values: dict with measurement values (weight, fat_ratio, etc.)
    """
    params = (
        date_str,
        values.get("weight"),
        values.get("fat_ratio"),
        values.get("fat_mass"),
        values.get("fat_free_mass"),
        values.get("heart_rate"),
        values.get("bmi"),
    )

    _exec(conn, """
        INSERT INTO withings_measurements
        (date, weight, fat_ratio, fat_mass, fat_free_mass, heart_rate, bmi)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            weight=COALESCE(excluded.weight, withings_measurements.weight),
            fat_ratio=COALESCE(excluded.fat_ratio, withings_measurements.fat_ratio),
            fat_mass=COALESCE(excluded.fat_mass, withings_measurements.fat_mass),
            fat_free_mass=COALESCE(excluded.fat_free_mass, withings_measurements.fat_free_mass),
            heart_rate=COALESCE(excluded.heart_rate, withings_measurements.heart_rate),
            bmi=COALESCE(excluded.bmi, withings_measurements.bmi),
            synced_at=CURRENT_TIMESTAMP
    """, params)


# ---------------------------------------------------------------------------
# Main entry point: sync_withings_measurements
# ---------------------------------------------------------------------------

def sync_withings_measurements(access_token: str, conn,
                                refresh_func=None) -> dict:
    """Smart Withings sync: full history on first run, incremental after.

    Args:
        access_token: current OAuth access token
        conn: database connection
        refresh_func: optional callable() returning new access_token on 401

    Returns:
        dict with 'measurements' count.
    """
    today = date.today()

    # Determine start date
    row = _fetchone(conn, "SELECT MIN(date) FROM withings_measurements")
    min_date = row[0] if row and row[0] else None
    row2 = _fetchone(conn, "SELECT MAX(date) FROM withings_measurements")
    max_date = row2[0] if row2 and row2[0] else None

    if max_date:
        if isinstance(max_date, str):
            start = date.fromisoformat(max_date) - timedelta(days=1)
        else:
            start = max_date - timedelta(days=1)
    else:
        start = date(2009, 1, 1)

    start_ts = int(datetime.combine(start, datetime.min.time()).timestamp())
    end_ts = int(datetime.combine(today, datetime.max.time()).timestamp())

    total_count = 0
    offset = 0

    # Paginated fetch
    while True:
        params = {
            "action": "getmeas",
            "startdate": start_ts,
            "enddate": end_ts,
            "category": 1,
        }
        if offset:
            params["offset"] = offset

        body = api_call(access_token, "measure", params,
                        refresh_func=refresh_func)
        groups = body.get("measuregrps", [])
        total_count += process_measure_groups(conn, groups)

        more = body.get("more")
        next_offset = body.get("offset")
        if more and next_offset:
            offset = next_offset
        else:
            break

    # Backfill older data if needed
    if max_date and min_date:
        min_d = date.fromisoformat(min_date) if isinstance(min_date, str) else min_date
        if min_d > date(2009, 1, 1):
            old_start_ts = int(datetime.combine(date(2009, 1, 1), datetime.min.time()).timestamp())
            old_end_ts = int(datetime.combine(min_d, datetime.max.time()).timestamp())
            offset = 0
            while True:
                params = {
                    "action": "getmeas",
                    "startdate": old_start_ts,
                    "enddate": old_end_ts,
                    "category": 1,
                }
                if offset:
                    params["offset"] = offset
                body = api_call(access_token, "measure", params,
                                refresh_func=refresh_func)
                groups = body.get("measuregrps", [])
                total_count += process_measure_groups(conn, groups)

                more = body.get("more")
                next_offset = body.get("offset")
                if more and next_offset:
                    offset = next_offset
                else:
                    break

    return {"measurements": total_count}
