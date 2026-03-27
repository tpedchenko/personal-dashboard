"""Core Garmin sync logic shared between webapp and NAS scheduler.

All functions accept a database connection (conn) as parameter instead of
calling get_conn() internally. This makes them usable with both SQLite
(webapp) and psycopg2 (scheduler).

The conn object must support:
  - conn.execute(sql, params) -> cursor  (SQLite style)
  - OR conn.cursor() context manager      (psycopg2 style)

Use the helper _exec() for portable execution across both backends.
"""
import logging
import time
from datetime import date, timedelta
from typing import Callable

_log = logging.getLogger(__name__)

_API_DELAY = 0.5  # seconds between API calls to avoid rate limiting


# ---------------------------------------------------------------------------
# Portable SQL execution
# ---------------------------------------------------------------------------

def _exec(conn, sql, params=()):
    """Execute SQL portably on both SQLite and psycopg2 connections.

    SQLite uses '?' placeholders; psycopg2 uses '%s'.
    Detects the backend from the connection's module name.
    """
    mod = type(conn).__module__
    if "psycopg2" in mod or "psycopg" in mod:
        # Convert '?' placeholders to '%s' for PostgreSQL
        sql = sql.replace("?", "%s")
        # Replace CURRENT_TIMESTAMP with NOW() for PostgreSQL if in SET clause
        # (both work in INSERT VALUES, but in ON CONFLICT SET we need consistency)
        with conn.cursor() as cur:
            cur.execute(sql, params)
            try:
                return cur.fetchall()
            except Exception:
                return []
    else:
        # SQLite
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
# Value extraction helper (shared with src/garmin.py)
# ---------------------------------------------------------------------------

def _val(v):
    """Extract scalar value from potentially nested Garmin API response.

    Garmin API sometimes returns dicts like {"value": 45} or lists
    instead of plain scalars. Database bindings can only handle scalars.
    """
    if v is None:
        return None
    if isinstance(v, (int, float, str)):
        return v
    if isinstance(v, dict):
        for key in ("value", "avg", "average", "score", "level", "weeklyAvg",
                     "lastNightAvg", "vo2MaxPreciseValue", "vo2MaxValue"):
            if key in v:
                return _val(v[key])
        return None
    if isinstance(v, list):
        return None
    return v


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def authenticate_garmin(email: str, password: str, garth_dir: str,
                        mfa_code: str | None = None):
    """Create and authenticate a Garmin Connect client.

    Args:
        email: Garmin Connect email
        password: Garmin Connect password
        garth_dir: path to directory for saving/loading garth session tokens
        mfa_code: optional MFA code for two-factor authentication

    Returns:
        Authenticated Garmin client object.

    Raises:
        GarminMFARequired: if MFA is needed and no mfa_code was provided.
        ValueError: if credentials are empty.
    """
    from garminconnect import Garmin
    from pathlib import Path

    if not email or not password:
        raise ValueError("Garmin credentials not configured.")

    Path(garth_dir).mkdir(parents=True, exist_ok=True)

    # Try loading saved garth session first (avoids fresh login / rate limits)
    try:
        client = Garmin(email, password)
        client.login(garth_dir)
        # Verify session is still valid with a lightweight API call
        client.get_user_summary()
        return client
    except Exception as e:
        err_str = str(e)
        # If we got a 429 even on session resume, propagate it immediately
        if "429" in err_str or "Too Many Requests" in err_str:
            raise
        # Otherwise, session is stale — try fresh login below
        pass

    # Fresh login -- may trigger MFA
    client = Garmin(email, password, return_on_mfa=True)
    mfa_flag, client_state = client.login()

    if mfa_flag:
        if mfa_code:
            client.resume_login(client_state, mfa_code)
            client.garth.dump(garth_dir)
            return client
        else:
            raise GarminMFARequired(client, client_state)

    # No MFA needed
    client.garth.dump(garth_dir)
    return client


class GarminMFARequired(Exception):
    """Raised when Garmin login requires MFA code."""
    def __init__(self, client, client_state: dict):
        self.client = client
        self.client_state = client_state
        super().__init__("MFA code required. Check your Garmin Connect app or email.")


# ---------------------------------------------------------------------------
# Safe API call wrapper
# ---------------------------------------------------------------------------

def _safe_call(method, *args, **kwargs):
    """Call API method, return None on any error."""
    try:
        result = method(*args, **kwargs)
        time.sleep(_API_DELAY)
        return result
    except Exception as e:
        _log.warning("Garmin API call %s failed: %s", method.__name__ if hasattr(method, '__name__') else method, e)
        return None


# ---------------------------------------------------------------------------
# Gap detection
# ---------------------------------------------------------------------------

def get_sync_date_range(conn) -> dict:
    """Analyze what Garmin data we already have and what's missing.

    Args:
        conn: database connection (SQLite or psycopg2)

    Returns:
        dict with status, min_date, max_date, count, missing_dates, days_since_last
    """
    row = _fetchone(conn, "SELECT MIN(date), MAX(date), COUNT(*) FROM garmin_daily")

    min_date_str, max_date_str, count = row
    if not min_date_str:
        return {"status": "empty", "min_date": None, "max_date": None,
                "count": 0, "missing_dates": [], "days_since_last": None}

    # Handle both string dates (SQLite) and date objects (PostgreSQL)
    if isinstance(min_date_str, str):
        min_d = date.fromisoformat(min_date_str)
        max_d = date.fromisoformat(max_date_str)
    else:
        min_d = min_date_str
        max_d = max_date_str

    # Find gaps between min and max
    all_dates = set()
    d = min_d
    while d <= max_d:
        all_dates.add(d.isoformat())
        d += timedelta(days=1)

    existing_rows = _exec(conn, "SELECT date FROM garmin_daily")
    existing = set()
    for r in existing_rows:
        val = r[0]
        existing.add(val.isoformat() if isinstance(val, date) else val)

    missing = sorted(all_dates - existing)
    days_since = (date.today() - max_d).days

    return {
        "status": "has_data",
        "min_date": min_d,
        "max_date": max_d,
        "count": count,
        "missing_dates": missing,
        "days_since_last": days_since,
    }


# ---------------------------------------------------------------------------
# Find earliest available data
# ---------------------------------------------------------------------------

def _find_earliest_date(client) -> date:
    """Find earliest available Garmin data date via activity history.

    Limited to max 5 API calls (500 activities) to avoid blocking.
    Caps lookback at 2 years maximum.
    """
    max_lookback = date.today() - timedelta(days=730)
    try:
        batch_size = 100
        oldest_date = date.today()
        offset = 0
        max_batches = 5
        for _ in range(max_batches):
            batch = client.get_activities(offset, batch_size)
            if not batch:
                break
            for a in batch:
                a_date_str = (a.get("startTimeLocal") or "")[:10]
                if a_date_str:
                    try:
                        a_date = date.fromisoformat(a_date_str)
                        if a_date < oldest_date:
                            oldest_date = a_date
                    except ValueError:
                        pass
            if len(batch) < batch_size:
                break
            offset += batch_size
            time.sleep(_API_DELAY)
        return max(oldest_date, max_lookback)
    except Exception:
        return max_lookback


# ---------------------------------------------------------------------------
# Core sync: per-day data
# ---------------------------------------------------------------------------

def _sync_day(client, conn, d_str: str, counts: dict):
    """Sync all per-date data for a single day into the database.

    Args:
        client: authenticated Garmin Connect client
        conn: database connection
        d_str: date string (YYYY-MM-DD)
        counts: mutable dict to update with sync counts
    """
    stats = _safe_call(client.get_stats, d_str)
    hrv = _safe_call(client.get_hrv_data, d_str)
    training_readiness = _safe_call(client.get_training_readiness, d_str)
    training_status = _safe_call(client.get_training_status, d_str)
    max_metrics = _safe_call(client.get_max_metrics, d_str)
    fitness_age = _safe_call(client.get_fitnessage_data, d_str)

    if stats and isinstance(stats, dict):
        try:
            upsert_daily(conn, d_str, stats, hrv, training_readiness,
                         training_status, max_metrics, fitness_age)
            counts["daily"] += 1
        except Exception:
            counts["errors"] += 1

    # Sleep
    sleep = _safe_call(client.get_sleep_data, d_str)
    if sleep and isinstance(sleep, dict) and sleep.get("dailySleepDTO"):
        try:
            upsert_sleep(conn, d_str, sleep)
            counts["sleep"] += 1
        except Exception:
            counts["errors"] += 1


# ---------------------------------------------------------------------------
# Core sync: activities
# ---------------------------------------------------------------------------

def _sync_all_activities(client, conn, info: dict, counts: dict):
    """Sync all activities -- full history or incremental.

    Args:
        client: authenticated Garmin Connect client
        conn: database connection
        info: result from get_sync_date_range()
        counts: mutable dict to update
    """
    if info["status"] == "empty":
        offset = 0
        batch_size = 100
        all_activities = []
        while True:
            batch = _safe_call(client.get_activities, offset, batch_size)
            if not batch:
                break
            all_activities.extend(batch)
            if len(batch) < batch_size:
                break
            offset += batch_size
        if all_activities:
            upsert_activities(conn, all_activities)
            counts["activities"] = len(all_activities)
    else:
        start = info["max_date"].isoformat()
        end = date.today().isoformat()
        activities = _safe_call(client.get_activities_by_date, start, end)
        if activities:
            upsert_activities(conn, activities)
            counts["activities"] = len(activities)


# ---------------------------------------------------------------------------
# Core sync: body composition
# ---------------------------------------------------------------------------

def _sync_body_composition(client, conn, dates: list[date], counts: dict):
    """Sync body composition in 30-day windows covering the synced range.

    Args:
        client: authenticated Garmin Connect client
        conn: database connection
        dates: list of date objects to cover
        counts: mutable dict to update
    """
    if not dates:
        return
    start = min(dates)
    end = max(dates)
    window_start = start
    while window_start <= end:
        window_end = min(window_start + timedelta(days=30), end)
        data = _safe_call(client.get_body_composition,
                          window_start.isoformat(), window_end.isoformat())
        if data and isinstance(data, dict):
            weights = data.get("dateWeightList") or data.get("totalAverage") or []
            if isinstance(weights, list):
                for w in weights:
                    w_date = w.get("calendarDate") or w.get("date")
                    if w_date:
                        upsert_body_comp(conn, w_date, w)
                        counts["body_comp"] += 1
        window_start = window_end + timedelta(days=1)


# ---------------------------------------------------------------------------
# Main entry point: sync_garmin_data
# ---------------------------------------------------------------------------

def sync_garmin_data(client, conn,
                     progress_callback: Callable[[int, int, str], None] | None = None,
                     ) -> dict:
    """Smart Garmin sync: auto-detects gaps, full history on first run.

    Args:
        client: authenticated Garmin Connect client
        conn: database connection (SQLite or psycopg2)
        progress_callback: optional (current, total, message) for progress bar

    Returns:
        dict with counts: daily, activities, sleep, body_comp, errors
    """
    today = date.today()
    counts = {"daily": 0, "activities": 0, "sleep": 0, "body_comp": 0, "errors": 0}

    # Determine dates to sync
    info = get_sync_date_range(conn)

    if info["status"] == "empty":
        start_date = _find_earliest_date(client)
        dates_to_sync = []
        d = start_date
        while d <= today:
            dates_to_sync.append(d)
            d += timedelta(days=1)
    else:
        dates_to_sync = [date.fromisoformat(ds) for ds in info["missing_dates"]]
        d = info["max_date"] + timedelta(days=1)
        while d <= today:
            dates_to_sync.append(d)
            d += timedelta(days=1)
        if today not in dates_to_sync:
            dates_to_sync.append(today)

    total = len(dates_to_sync)
    if progress_callback:
        progress_callback(0, max(total, 1), f"Syncing {total} days...")

    # Sync per-date data
    for i, d in enumerate(dates_to_sync):
        d_str = d.isoformat()
        try:
            _sync_day(client, conn, d_str, counts)
        except Exception as e:
            _log.error("Garmin sync_day %s failed: %s", d_str, e, exc_info=True)
            counts["errors"] += 1
        if progress_callback:
            err_msg = f", {counts['errors']} errors" if counts['errors'] else ""
            progress_callback(i + 1, total,
                f"Day {i + 1}/{total}: {d_str} "
                f"({counts['daily']} daily, {counts['sleep']} sleep{err_msg})")

    # Sync activities (bulk)
    if progress_callback:
        progress_callback(total, total, "Syncing activities...")
    try:
        _sync_all_activities(client, conn, info, counts)
    except Exception as e:
        _log.error("Garmin sync_all_activities failed: %s", e, exc_info=True)
        counts["errors"] += 1

    # Auto-link strength activities to user gym workouts
    if counts["activities"] > 0:
        try:
            _auto_link_strength_workouts(conn)
        except Exception as e:
            _log.error("Garmin auto-link workouts failed: %s", e, exc_info=True)

    # Sync body composition
    if progress_callback:
        progress_callback(total, total, "Syncing body composition...")
    try:
        _sync_body_composition(client, conn, dates_to_sync, counts)
    except Exception as e:
        _log.error("Garmin sync_body_composition failed: %s", e, exc_info=True)
        counts["errors"] += 1

    # Save session
    try:
        client.garth.dump(str(client.garth.dir) if hasattr(client.garth, 'dir') else "")
    except Exception:
        pass

    return counts


# ---------------------------------------------------------------------------
# Upsert functions (conn-based, no get_conn())
# ---------------------------------------------------------------------------

def upsert_daily(conn, d_str: str, stats: dict, hrv: dict | None,
                 training_readiness: dict | None, training_status: dict | None,
                 max_metrics: dict | None, fitness_age: dict | None):
    """Upsert daily summary with data from multiple endpoints.

    Args:
        conn: database connection
        d_str: date string (YYYY-MM-DD)
        stats: daily stats dict from Garmin API
        hrv: HRV data dict (or None)
        training_readiness: training readiness dict (or None)
        training_status: training status dict (or None)
        max_metrics: max metrics dict (or None)
        fitness_age: fitness age dict (or None)
    """
    # Extract HRV
    hrv_weekly = hrv_night = hrv_stat = None
    if hrv and isinstance(hrv, dict):
        summary = hrv.get("hrvSummary") or hrv.get("summary") or hrv
        if isinstance(summary, dict):
            hrv_weekly = _val(summary.get("weeklyAvg"))
            hrv_night = (_val(summary.get("lastNightAvg"))
                         or _val(summary.get("lastNight"))
                         or _val(summary.get("lastNightFiveMAvg")))
            hrv_stat = _val(summary.get("status")) or _val(summary.get("hrvStatus"))

    # Extract training readiness
    tr_score = tr_status_text = training_load_val = None
    if training_readiness:
        tr_data = training_readiness
        if isinstance(tr_data, list) and tr_data:
            tr_data = tr_data[0]
        if isinstance(tr_data, dict):
            tr_score = _val(tr_data.get("score")) or _val(tr_data.get("readinessScore"))
    if training_status:
        ts_data = training_status
        if isinstance(ts_data, list) and ts_data:
            ts_data = ts_data[0]
        if isinstance(ts_data, dict):
            tr_status_text = _val(ts_data.get("trainingStatus")) or _val(ts_data.get("currentDayTrainingStatus"))
            training_load_val = _val(ts_data.get("acuteTrainingLoad"))

    # Extract VO2max
    vo2_run = vo2_cycle = None
    if max_metrics and isinstance(max_metrics, dict):
        generic = max_metrics.get("generic") or max_metrics
        if isinstance(generic, dict):
            vo2_run = _val(generic.get("vo2MaxPreciseValue")) or _val(generic.get("vo2MaxValue"))
        elif isinstance(generic, list) and generic:
            vo2_run = _val(generic[0].get("vo2MaxPreciseValue")) if isinstance(generic[0], dict) else None
        cycling = max_metrics.get("cycling")
        if isinstance(cycling, dict):
            vo2_cycle = _val(cycling.get("vo2MaxPreciseValue")) or _val(cycling.get("vo2MaxValue"))
        elif isinstance(cycling, list) and cycling:
            vo2_cycle = _val(cycling[0].get("vo2MaxPreciseValue")) if isinstance(cycling[0], dict) else None

    # Extract fitness age
    fit_age = None
    if fitness_age and isinstance(fitness_age, dict):
        fit_age = _val(fitness_age.get("fitnessAge")) or _val(fitness_age.get("chronologicalAge"))

    params = (
        d_str,
        _val(stats.get("totalSteps")),
        _val(stats.get("totalKilocalories")),
        _val(stats.get("activeKilocalories")),
        _val(stats.get("totalDistanceMeters")),
        _val(stats.get("floorsAscended")),
        _val(stats.get("floorsDescended")),
        _val(stats.get("intensityMinutes")),
        _val(stats.get("restingHeartRate")),
        _val(stats.get("averageHeartRate")),
        _val(stats.get("maxHeartRate")),
        _val(stats.get("averageStressLevel")),
        _val(stats.get("maxStressLevel")),
        _val(stats.get("bodyBatteryHighestValue")),
        _val(stats.get("bodyBatteryLowestValue")),
        _val(stats.get("sleepingSeconds")),
        _val(stats.get("sleepScore")),
        _val(stats.get("averageSpo2")),
        _val(stats.get("averageRespirationRate")),
        hrv_weekly,
        hrv_night,
        hrv_stat,
        tr_score,
        tr_status_text,
        training_load_val,
        vo2_run,
        vo2_cycle,
        fit_age,
        _val(stats.get("bodyBatteryChargedValue")),
        _val(stats.get("bodyBatteryDrainedValue")),
        _val(stats.get("dailyStepGoal")),
        _val(stats.get("moderateIntensityMinutes")),
        _val(stats.get("vigorousIntensityMinutes")),
        _val(stats.get("lowestSpo2")),
    )

    _exec(conn, """
        INSERT INTO garmin_daily
        (date, steps, calories_total, calories_active, distance_m,
         floors_up, floors_down, intensity_minutes,
         resting_hr, avg_hr, max_hr,
         avg_stress, max_stress,
         body_battery_high, body_battery_low,
         sleep_seconds, sleep_score, spo2_avg, respiration_avg,
         hrv_weekly_avg, hrv_last_night, hrv_status,
         training_readiness_score, training_status, training_load,
         vo2max_running, vo2max_cycling,
         fitness_age,
         body_battery_charged, body_battery_drained,
         steps_goal, moderate_intensity_minutes, vigorous_intensity_minutes,
         lowest_spo2)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(date) DO UPDATE SET
            steps=COALESCE(excluded.steps, steps),
            calories_total=COALESCE(excluded.calories_total, calories_total),
            calories_active=COALESCE(excluded.calories_active, calories_active),
            distance_m=COALESCE(excluded.distance_m, distance_m),
            floors_up=COALESCE(excluded.floors_up, floors_up),
            floors_down=COALESCE(excluded.floors_down, floors_down),
            intensity_minutes=COALESCE(excluded.intensity_minutes, intensity_minutes),
            resting_hr=COALESCE(excluded.resting_hr, resting_hr),
            avg_hr=COALESCE(excluded.avg_hr, avg_hr),
            max_hr=COALESCE(excluded.max_hr, max_hr),
            avg_stress=COALESCE(excluded.avg_stress, avg_stress),
            max_stress=COALESCE(excluded.max_stress, max_stress),
            body_battery_high=COALESCE(excluded.body_battery_high, body_battery_high),
            body_battery_low=COALESCE(excluded.body_battery_low, body_battery_low),
            sleep_seconds=COALESCE(excluded.sleep_seconds, sleep_seconds),
            sleep_score=COALESCE(excluded.sleep_score, sleep_score),
            spo2_avg=COALESCE(excluded.spo2_avg, spo2_avg),
            respiration_avg=COALESCE(excluded.respiration_avg, respiration_avg),
            hrv_weekly_avg=COALESCE(excluded.hrv_weekly_avg, hrv_weekly_avg),
            hrv_last_night=COALESCE(excluded.hrv_last_night, hrv_last_night),
            hrv_status=COALESCE(excluded.hrv_status, hrv_status),
            training_readiness_score=COALESCE(excluded.training_readiness_score, training_readiness_score),
            training_status=COALESCE(excluded.training_status, training_status),
            training_load=COALESCE(excluded.training_load, training_load),
            vo2max_running=COALESCE(excluded.vo2max_running, vo2max_running),
            vo2max_cycling=COALESCE(excluded.vo2max_cycling, vo2max_cycling),
            fitness_age=COALESCE(excluded.fitness_age, fitness_age),
            body_battery_charged=COALESCE(excluded.body_battery_charged, body_battery_charged),
            body_battery_drained=COALESCE(excluded.body_battery_drained, body_battery_drained),
            steps_goal=COALESCE(excluded.steps_goal, steps_goal),
            moderate_intensity_minutes=COALESCE(excluded.moderate_intensity_minutes, moderate_intensity_minutes),
            vigorous_intensity_minutes=COALESCE(excluded.vigorous_intensity_minutes, vigorous_intensity_minutes),
            lowest_spo2=COALESCE(excluded.lowest_spo2, lowest_spo2),
            synced_at=CURRENT_TIMESTAMP
    """, params)


def upsert_sleep(conn, d_str: str, sleep_data: dict):
    """Upsert sleep data with expanded fields.

    Args:
        conn: database connection
        d_str: date string (YYYY-MM-DD)
        sleep_data: sleep data dict from Garmin API
    """
    dto = sleep_data.get("dailySleepDTO", {})

    avg_hr = _val(dto.get("averageHeartRate")) or _val(dto.get("averageHR"))
    lowest_hr = _val(dto.get("lowestHeartRate")) or _val(dto.get("lowestHR"))
    highest_hr = _val(dto.get("highestHeartRate")) or _val(dto.get("highestHR"))
    avg_resp = _val(dto.get("averageRespirationValue"))
    avg_spo2 = _val(dto.get("averageSpO2Value")) or _val(dto.get("averageSpO2"))
    lowest_spo2 = _val(dto.get("lowestSpO2Value")) or _val(dto.get("lowestSpO2"))
    hrv_sleep = _val(dto.get("hrvStatus")) or _val(dto.get("sleepHrv"))
    bb_change = _val(dto.get("bodyBatteryChange"))

    scores = dto.get("sleepScores")
    score = scores.get("overall") if isinstance(scores, dict) else None

    params = (
        d_str,
        _val(dto.get("sleepStartTimestampLocal")),
        _val(dto.get("sleepEndTimestampLocal")),
        _val(dto.get("sleepTimeSeconds")),
        _val(dto.get("deepSleepSeconds")),
        _val(dto.get("lightSleepSeconds")),
        _val(dto.get("remSleepSeconds")),
        _val(dto.get("awakeSleepSeconds")),
        _val(score),
        avg_resp,
        avg_spo2,
        lowest_spo2,
        avg_hr,
        lowest_hr,
        highest_hr,
        hrv_sleep,
        bb_change,
    )

    _exec(conn, """
        INSERT INTO garmin_sleep
        (date, sleep_start, sleep_end, duration_seconds,
         deep_seconds, light_seconds, rem_seconds, awake_seconds, sleep_score,
         avg_respiration, avg_spo2, lowest_spo2,
         avg_hr, lowest_hr, highest_hr, hrv_sleep, body_battery_change)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(date) DO UPDATE SET
            sleep_start=COALESCE(excluded.sleep_start, sleep_start),
            sleep_end=COALESCE(excluded.sleep_end, sleep_end),
            duration_seconds=COALESCE(excluded.duration_seconds, duration_seconds),
            deep_seconds=COALESCE(excluded.deep_seconds, deep_seconds),
            light_seconds=COALESCE(excluded.light_seconds, light_seconds),
            rem_seconds=COALESCE(excluded.rem_seconds, rem_seconds),
            awake_seconds=COALESCE(excluded.awake_seconds, awake_seconds),
            sleep_score=COALESCE(excluded.sleep_score, sleep_score),
            avg_respiration=COALESCE(excluded.avg_respiration, avg_respiration),
            avg_spo2=COALESCE(excluded.avg_spo2, avg_spo2),
            lowest_spo2=COALESCE(excluded.lowest_spo2, lowest_spo2),
            avg_hr=COALESCE(excluded.avg_hr, avg_hr),
            lowest_hr=COALESCE(excluded.lowest_hr, lowest_hr),
            highest_hr=COALESCE(excluded.highest_hr, highest_hr),
            hrv_sleep=COALESCE(excluded.hrv_sleep, hrv_sleep),
            body_battery_change=COALESCE(excluded.body_battery_change, body_battery_change),
            synced_at=CURRENT_TIMESTAMP
    """, params)


def upsert_activities(conn, activities: list[dict]):
    """Upsert activities with expanded fields.

    Args:
        conn: database connection
        activities: list of activity dicts from Garmin API
    """
    for a in activities:
        aid = a.get("activityId")
        if not aid:
            continue
        start_time_local = a.get("startTimeLocal") or ""
        a_date = start_time_local[:10]
        act_type = a.get("activityType")
        type_key = act_type.get("typeKey") if isinstance(act_type, dict) else None
        sport_type_dto = a.get("sportTypeDTO")
        sport_type = sport_type_dto.get("sportTypeName") if isinstance(sport_type_dto, dict) else None

        params = (
            aid,
            a_date,
            type_key,
            _val(a.get("activityName")),
            _val(a.get("duration")),
            _val(a.get("distance")),
            _val(a.get("calories")),
            _val(a.get("averageHR")),
            _val(a.get("maxHR")),
            _val(a.get("averageSpeed")),
            _val(a.get("elevationGain")),
            _val(a.get("aerobicTrainingEffect")),
            _val(a.get("anaerobicTrainingEffect")),
            _val(a.get("averageRunningCadenceInStepsPerMinute")),
            _val(a.get("maxRunningCadenceInStepsPerMinute")),
            _val(a.get("avgPower")),
            _val(a.get("steps")),
            sport_type,
            _val(a.get("eventType", {}).get("typeKey")) if isinstance(a.get("eventType"), dict) else None,
            start_time_local or None,
        )

        _exec(conn, """
            INSERT INTO garmin_activities
            (activity_id, date, activity_type, activity_name,
             duration_seconds, distance_m, calories,
             avg_hr, max_hr, avg_speed, elevation_gain,
             training_effect_aerobic, training_effect_anaerobic,
             avg_running_cadence, max_running_cadence, avg_power,
             steps, sport_type, event_type, start_time_local)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(activity_id) DO UPDATE SET
                date=excluded.date, activity_type=excluded.activity_type,
                activity_name=excluded.activity_name,
                duration_seconds=excluded.duration_seconds, distance_m=excluded.distance_m,
                calories=excluded.calories,
                avg_hr=excluded.avg_hr, max_hr=excluded.max_hr,
                avg_speed=excluded.avg_speed, elevation_gain=excluded.elevation_gain,
                training_effect_aerobic=excluded.training_effect_aerobic,
                training_effect_anaerobic=excluded.training_effect_anaerobic,
                avg_running_cadence=COALESCE(excluded.avg_running_cadence, garmin_activities.avg_running_cadence),
                max_running_cadence=COALESCE(excluded.max_running_cadence, garmin_activities.max_running_cadence),
                avg_power=COALESCE(excluded.avg_power, garmin_activities.avg_power),
                steps=COALESCE(excluded.steps, garmin_activities.steps),
                sport_type=COALESCE(excluded.sport_type, garmin_activities.sport_type),
                event_type=COALESCE(excluded.event_type, garmin_activities.event_type),
                start_time_local=COALESCE(excluded.start_time_local, garmin_activities.start_time_local),
                synced_at=CURRENT_TIMESTAMP
        """, params)


def upsert_body_comp(conn, d_str: str, data: dict):
    """Upsert body composition measurement.

    Args:
        conn: database connection
        d_str: date string (YYYY-MM-DD)
        data: body composition dict from Garmin API
    """
    weight = _val(data.get("weight"))
    if weight and weight > 1000:
        weight = weight / 1000.0

    params = (
        d_str,
        weight,
        _val(data.get("bmi")),
        _val(data.get("bodyFatPercentage")) or _val(data.get("bodyFat")),
        _val(data.get("muscleMass")),
        _val(data.get("boneMass")),
        _val(data.get("bodyWaterPercentage")) or _val(data.get("bodyWater")),
        _val(data.get("physiqueRating")),
        _val(data.get("metabolicAge")),
        _val(data.get("visceralFat")),
    )

    _exec(conn, """
        INSERT INTO garmin_body_composition
        (date, weight, bmi, body_fat_pct, muscle_mass, bone_mass,
         body_water_pct, physique_rating, metabolic_age, visceral_fat)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(date) DO UPDATE SET
            weight=COALESCE(excluded.weight, weight),
            bmi=COALESCE(excluded.bmi, bmi),
            body_fat_pct=COALESCE(excluded.body_fat_pct, body_fat_pct),
            muscle_mass=COALESCE(excluded.muscle_mass, muscle_mass),
            bone_mass=COALESCE(excluded.bone_mass, bone_mass),
            body_water_pct=COALESCE(excluded.body_water_pct, body_water_pct),
            physique_rating=COALESCE(excluded.physique_rating, physique_rating),
            metabolic_age=COALESCE(excluded.metabolic_age, metabolic_age),
            visceral_fat=COALESCE(excluded.visceral_fat, visceral_fat),
            synced_at=CURRENT_TIMESTAMP
    """, params)


def _auto_link_strength_workouts(conn):
    """Auto-link unlinked Garmin strength activities to user gym workouts on the same date.

    For each garmin strength_training activity without a linked gym workout,
    finds a user-created gym workout on the same date and links them,
    copying duration, calories, and avg_hr from garmin.
    """
    # Find unlinked garmin strength activities that have matching user workouts
    unlinked = _exec(conn, """
        SELECT ga.activity_id, ga.date, ga.duration_seconds, ga.calories, ga.avg_hr
        FROM garmin_activities ga
        WHERE ga.activity_type = 'strength_training'
          AND NOT EXISTS (
              SELECT 1 FROM gym_workouts w
              WHERE w.garmin_activity_id = ga.activity_id
          )
          AND EXISTS (
              SELECT 1 FROM gym_workouts w
              WHERE w.date = ga.date AND w.garmin_activity_id IS NULL
          )
    """)

    for row in unlinked:
        activity_id, ga_date, dur_sec, cal, hr = row
        dur_min = round(dur_sec / 60) if dur_sec else None

        # Find the first unlinked user workout on this date
        target = _fetchone(conn, """
            SELECT id FROM gym_workouts
            WHERE date = ? AND garmin_activity_id IS NULL
            ORDER BY id ASC LIMIT 1
        """, (ga_date,))

        if target:
            _exec(conn, """
                UPDATE gym_workouts
                SET garmin_activity_id = ?,
                    duration_minutes = COALESCE(?, duration_minutes),
                    calories = ?,
                    avg_hr = ?
                WHERE id = ?
            """, (activity_id, dur_min, cal, hr, target[0]))
            _log.info("Linked garmin activity %s to workout %s on %s", activity_id, target[0], ga_date)
