"""Analytics: recommendations, recovery, frequency, Garmin merge, stats, PRs, muscle stats."""
from datetime import date, timedelta, datetime
from collections import defaultdict

import pandas as pd

from src.database import get_conn, read_sql


# ─── Muscle recovery ─────────────────────────────────────────────────────────

_MUSCLE_GROUPS = {
    # Upper body — 72h recovery
    "chest": {"recovery_hours": 72, "label": "Chest"},
    "back": {"recovery_hours": 72, "label": "Back"},
    "shoulders": {"recovery_hours": 72, "label": "Shoulders"},
    "biceps": {"recovery_hours": 72, "label": "Biceps"},
    "triceps": {"recovery_hours": 72, "label": "Triceps"},
    "traps": {"recovery_hours": 72, "label": "Traps"},
    "core": {"recovery_hours": 72, "label": "Core"},
    # Lower body — 96h recovery (1 day more)
    "quads": {"recovery_hours": 96, "label": "Quads"},
    "hamstrings": {"recovery_hours": 96, "label": "Hamstrings"},
    "glutes": {"recovery_hours": 96, "label": "Glutes"},
    "calves": {"recovery_hours": 96, "label": "Calves"},
}


def get_muscle_last_trained() -> dict:
    """Get last training date per muscle group (for recovery visualization)."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT e.muscle_group, MAX(w.date) as last_date
            FROM gym_workout_exercises we
            JOIN gym_exercises e ON e.id = we.exercise_id
            JOIN gym_workouts w ON w.id = we.workout_id
            GROUP BY e.muscle_group
        """).fetchall()
    return {r[0]: r[1] for r in rows if r[0]}


def get_muscle_recovery_status() -> dict:
    """Get recovery status for each muscle group.

    Returns dict: {muscle: {"hours_since": N, "status": "red"|"orange"|"green"|"recovered", "color": "#hex"}}
    Red = <24h (upper) / <24h (lower)
    Orange = 24-48h (upper) / 24-72h (lower)
    Green = 48-72h (upper) / 72-96h (lower)
    Recovered = >72h (upper) / >96h (lower)
    """
    last_trained = get_muscle_last_trained()
    now = datetime.now()
    result = {}

    for muscle, info in _MUSCLE_GROUPS.items():
        last_date_str = last_trained.get(muscle)
        if not last_date_str:
            result[muscle] = {"hours_since": None, "status": "recovered", "color": "none", "label": info["label"]}
            continue

        last_dt = datetime.strptime(last_date_str, "%Y-%m-%d")
        hours = (now - last_dt).total_seconds() / 3600
        recovery_h = info["recovery_hours"]

        if hours < 24:
            status, color = "red", "#ef4444"
        elif hours < recovery_h * 2/3:
            status, color = "orange", "#f59e0b"
        elif hours < recovery_h:
            status, color = "green", "#22c55e"
        else:
            status, color = "recovered", "none"

        result[muscle] = {"hours_since": round(hours), "status": status,
                          "color": color, "label": info["label"]}

    return result


# ─── Exercise PRs ────────────────────────────────────────────────────────────

def get_exercise_prs(exercise_name: str) -> dict:
    """Get personal records for an exercise: best 1RM, max weight, max reps, max volume."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT s.weight_kg, s.reps, w.date
            FROM gym_sets s
            JOIN gym_workout_exercises we ON we.id = s.workout_exercise_id
            JOIN gym_exercises e ON e.id = we.exercise_id
            JOIN gym_workouts w ON w.id = we.workout_id
            WHERE e.name = ? AND s.is_warmup = 0
                AND s.weight_kg IS NOT NULL AND s.weight_kg > 0
                AND s.reps IS NOT NULL AND s.reps > 0
            ORDER BY w.date
        """, (exercise_name,)).fetchall()

    if not rows:
        return {}

    best_1rm = 0
    best_1rm_date = ""
    max_weight = 0
    max_weight_date = ""
    max_reps = 0
    max_reps_date = ""
    max_volume_set = 0
    max_volume_date = ""

    for w, r, d in rows:
        # Epley 1RM formula
        est_1rm = w * (1 + r / 30) if r > 1 else w
        if est_1rm > best_1rm:
            best_1rm = est_1rm
            best_1rm_date = d
        if w > max_weight:
            max_weight = w
            max_weight_date = d
        if r > max_reps:
            max_reps = r
            max_reps_date = d
        vol = w * r
        if vol > max_volume_set:
            max_volume_set = vol
            max_volume_date = d

    return {
        "est_1rm": round(best_1rm, 1), "est_1rm_date": best_1rm_date,
        "max_weight": max_weight, "max_weight_date": max_weight_date,
        "max_reps": max_reps, "max_reps_date": max_reps_date,
        "max_volume_set": round(max_volume_set, 1), "max_volume_date": max_volume_date,
    }


# ─── Muscle volume stats ────────────────────────────────────────────────────

def get_weekly_muscle_volume(weeks: int = 8) -> pd.DataFrame:
    """Get total volume (weight x reps) per muscle group per week."""
    since = (date.today() - timedelta(weeks=weeks)).isoformat()
    with get_conn() as conn:
        df = read_sql("""
            SELECT w.date as workout_date,
                   e.muscle_group,
                   SUM(s.weight_kg * s.reps) as volume
            FROM gym_sets s
            JOIN gym_workout_exercises we ON we.id = s.workout_exercise_id
            JOIN gym_exercises e ON e.id = we.exercise_id
            JOIN gym_workouts w ON w.id = we.workout_id
            WHERE w.date >= ? AND s.is_warmup = 0
                AND s.weight_kg IS NOT NULL AND s.reps IS NOT NULL
                AND e.muscle_group IS NOT NULL
            GROUP BY w.date, e.muscle_group
            ORDER BY w.date
        """, conn, [since])
    if not df.empty:
        df["workout_date"] = pd.to_datetime(df["workout_date"])
        df["week"] = df["workout_date"].dt.strftime("%Y-W%W")
        df = df.groupby(["week", "muscle_group"], as_index=False)["volume"].sum()
        df = df.sort_values("week")
    return df


# ─── Workout stats ──────────────────────────────────────────────────────────

def get_workout_stats() -> dict:
    """Get overall workout statistics.

    Combines GymUp workouts and Garmin strength_training activities.
    Same-day workouts from both sources count as one.
    """
    with get_conn() as conn:
        # Unique workout dates from both GymUp and Garmin strength
        _has_garmin = False
        try:
            conn.execute("SELECT 1 FROM garmin_activities LIMIT 1")
            _has_garmin = True
        except Exception:
            pass

        if _has_garmin:
            # Subqueries need manual user_id injection (auto-inject skips them)
            all_dates = conn.execute(
                "SELECT DISTINCT date AS d FROM gym_workouts"
            ).fetchall()
            garmin_dates = conn.execute(
                "SELECT DISTINCT date AS d FROM garmin_activities WHERE activity_type = 'strength_training'"
            ).fetchall()
            # Merge and deduplicate
            all_d_set = {r[0] for r in all_dates if r[0]} | {r[0] for r in garmin_dates if r[0]}
            all_dates = [(d,) for d in all_d_set]
            last_workout = max(all_d_set) if all_d_set else None
        else:
            all_dates = conn.execute(
                "SELECT DISTINCT date AS d FROM gym_workouts"
            ).fetchall()
            last_workout = conn.execute(
                "SELECT MAX(date) FROM gym_workouts"
            ).fetchone()[0]

        total = len(all_dates)
        today_iso = date.today().isoformat()
        d7 = (date.today() - timedelta(7)).isoformat()
        d30 = (date.today() - timedelta(30)).isoformat()
        last_7d = sum(1 for (d,) in all_dates if d and d >= d7)
        last_30d = sum(1 for (d,) in all_dates if d and d >= d30)
        total_sets = conn.execute("SELECT COUNT(*) FROM gym_sets WHERE is_warmup = 0").fetchone()[0]

    return {
        "total_workouts": total,
        "last_7_days": last_7d,
        "last_30_days": last_30d,
        "last_workout": last_workout,
        "total_sets": total_sets,
    }


# ─── Workout recommendations ────────────────────────────────────────────────

_GOAL_CONFIG = {
    "hypertrophy": {"freq": 5, "label": "Hypertrophy (4-5x/week)"},
    "maintenance": {"freq": 3, "label": "Maintenance (3x/week)"},
    "recovery": {"freq": 2, "label": "Recovery (2x/week)"},
    "weight_loss": {"freq": 4, "label": "Weight Loss (cardio + full body)"},
}


def get_workout_recommendations(goal: str = "maintenance", days: int = 7) -> list[dict]:
    """Generate workout recommendations for the next N days based on goal and recovery.

    Returns: [{date, type, reason}] for each recommended workout day.
    """
    from .workouts import get_workouts

    today = date.today()
    recovery = get_muscle_recovery_status()
    last_trained = get_muscle_last_trained()
    config = _GOAL_CONFIG.get(goal, _GOAL_CONFIG["maintenance"])
    target_freq = config["freq"]

    # Get recent workouts (last 14 days) for pattern analysis
    recent = get_workouts(days=14)
    recent_types = {}
    if not recent.empty:
        for _, w in recent.iterrows():
            recent_types[w["date"]] = w.get("workout_name") or "Workout"

    # Check for Garmin cycling/running activities (affects leg recovery)
    _has_cardio_legs = False
    try:
        with get_conn() as conn:
            cardio = conn.execute("""
                SELECT date FROM garmin_activities
                WHERE activity_type IN ('cycling', 'running', 'trail_running',
                    'treadmill_running', 'gravel_cycling', 'road_biking', 'mountain_biking')
                AND date >= ?
                ORDER BY date DESC LIMIT 5
            """, ((today - timedelta(days=3)).isoformat(),)).fetchall()
            _has_cardio_legs = len(cardio) > 0
    except Exception:
        pass

    # Determine which muscle groups are recovered
    upper_recovered = all(
        recovery.get(m, {}).get("status") in ("green", "recovered", None)
        for m in ("chest", "back", "shoulders", "biceps", "triceps")
    )
    lower_recovered = all(
        recovery.get(m, {}).get("status") in ("green", "recovered", None)
        for m in ("quads", "hamstrings", "glutes", "calves")
    )

    # If recent cardio affected legs, consider them less recovered
    if _has_cardio_legs:
        lower_recovered = False

    # Determine last workout type
    last_type = None
    for d in sorted(recent_types.keys(), reverse=True):
        last_type = recent_types[d].lower()
        break

    # Build PPL rotation
    def _next_type(last: str | None) -> str:
        if goal == "weight_loss":
            return "Full Body"
        if not last:
            if upper_recovered:
                return "Push Day"
            elif lower_recovered:
                return "Legs"
            return "Pull Day"
        if "push" in (last or ""):
            return "Pull Day"
        if "pull" in (last or ""):
            if lower_recovered:
                return "Legs"
            return "Push Day"
        # After legs or full body
        return "Push Day"

    recommendations = []
    _prev_type = last_type
    workouts_scheduled = 0
    days_per_workout = max(1, 7 // target_freq)

    for i in range(days):
        d = today + timedelta(days=i)
        d_str = d.isoformat()

        # Skip if workout already done today
        if d_str in recent_types:
            _prev_type = recent_types[d_str].lower()
            continue

        if workouts_scheduled >= target_freq:
            break

        # Schedule based on frequency
        if i % days_per_workout == 0 or workouts_scheduled == 0:
            wtype = _next_type(_prev_type)
            reason = "Recovery complete" if (upper_recovered or lower_recovered) else "Scheduled"
            if "leg" in wtype.lower() and _has_cardio_legs:
                wtype = "Push Day" if upper_recovered else "Pull Day"
                reason = "Legs recovering from cardio"
            recommendations.append({"date": d_str, "type": wtype, "reason": reason})
            _prev_type = wtype.lower()
            workouts_scheduled += 1

    return recommendations


# ─── Garmin integration ──────────────────────────────────────────────────────

def merge_garmin_with_workouts() -> dict:
    """Merge Garmin strength_training activities with user gym workouts.

    For each date where both exist:
    - Links the user workout to the garmin activity (garmin_activity_id)
    - Copies duration, calories, avg_hr from garmin
    - Removes garmin-only duplicate workouts

    Returns: {"merged": int, "deleted_duplicates": int}
    """
    with get_conn() as conn:
        # Find unlinked garmin strength activities that have matching user workouts
        rows = conn.execute("""
            SELECT ga.activity_id, ga.date,
                   ga.duration_seconds, ga.calories, ga.avg_hr,
                   w.id as workout_id
            FROM garmin_activities ga
            JOIN gym_workouts w ON w.date = ga.date
            WHERE ga.activity_type = 'strength_training'
              AND w.garmin_activity_id IS NULL
            ORDER BY ga.date DESC, w.id ASC
        """).fetchall()

        # Group by garmin activity — pick the user workout with most exercises
        by_activity = defaultdict(list)
        for r in rows:
            by_activity[r[0]].append(r)

        merged = 0
        for activity_id, candidates in by_activity.items():
            # Pick first user workout for this garmin activity (already ordered by id ASC)
            _, ga_date, dur_sec, cal, hr, wid = candidates[0]
            dur_min = round(dur_sec / 60) if dur_sec else None
            conn.execute("""
                UPDATE gym_workouts
                SET garmin_activity_id = ?,
                    duration_minutes = COALESCE(?, duration_minutes),
                    calories = ?,
                    avg_hr = ?
                WHERE id = ?
            """, (activity_id, dur_min, cal, hr, wid))
            merged += 1

        # Delete garmin-only workouts that now have a user workout with the same garmin_activity_id
        # (workouts that were auto-created from garmin but now the user workout is linked)
        # First find IDs to delete
        dupe_ids = conn.execute("""
            SELECT gw.id FROM gym_workouts gw
            WHERE gw.garmin_activity_id IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM gym_workouts uw
                  WHERE uw.garmin_activity_id = gw.garmin_activity_id
                    AND uw.id != gw.id
                    AND uw.garmin_activity_id IS NOT NULL
              )
              AND gw.id NOT IN (
                  SELECT MIN(id) FROM gym_workouts
                  WHERE garmin_activity_id IS NOT NULL
                  GROUP BY garmin_activity_id
              )
        """).fetchall()

        deleted_count = 0
        for (did,) in dupe_ids:
            conn.execute("DELETE FROM gym_workouts WHERE id = ?", (did,))
            deleted_count += 1

    return {"merged": merged, "deleted_duplicates": deleted_count}


def link_garmin_activity_to_workout(garmin_activity_id: int, workout_date: str):
    """Auto-link a new garmin strength activity to an existing user workout on the same date.

    Called after garmin sync to merge new activities.
    """
    with get_conn() as conn:
        # Find garmin activity details
        ga = conn.execute("""
            SELECT duration_seconds, calories, avg_hr
            FROM garmin_activities
            WHERE activity_id = ? AND activity_type = 'strength_training'
        """, (garmin_activity_id,)).fetchone()
        if not ga:
            return

        dur_sec, cal, hr = ga
        dur_min = round(dur_sec / 60) if dur_sec else None

        # Find unlinked user workout on the same date
        workout = conn.execute("""
            SELECT id FROM gym_workouts
            WHERE date = ? AND garmin_activity_id IS NULL
            ORDER BY id ASC LIMIT 1
        """, (workout_date,)).fetchone()

        if workout:
            conn.execute("""
                UPDATE gym_workouts
                SET garmin_activity_id = ?,
                    duration_minutes = COALESCE(?, duration_minutes),
                    calories = ?,
                    avg_hr = ?
                WHERE id = ?
            """, (garmin_activity_id, dur_min, cal, hr, workout[0]))


def match_garmin_workouts() -> dict:
    """Auto-match gym workouts with Garmin strength_training activities by date.

    For each unmatched gym workout, finds Garmin strength_training activities
    on the same date and links them via garmin_activity_id.
    Returns summary: {matched, already_matched, no_garmin, total}.
    """
    with get_conn() as conn:
        # Get unmatched gym workouts
        unmatched = conn.execute("""
            SELECT id, date, duration_minutes FROM gym_workouts
            WHERE garmin_activity_id IS NULL
            ORDER BY date
        """).fetchall()

        already = conn.execute(
            "SELECT COUNT(*) FROM gym_workouts WHERE garmin_activity_id IS NOT NULL"
        ).fetchone()[0]

        matched = 0
        no_garmin = 0

        for w_id, w_date, w_dur in unmatched:
            # Find Garmin strength activities on same date
            garmin_acts = conn.execute("""
                SELECT activity_id, duration_seconds
                FROM garmin_activities
                WHERE date = ? AND activity_type = 'strength_training'
                ORDER BY activity_id
            """, (w_date,)).fetchall()

            if not garmin_acts:
                no_garmin += 1
                continue

            # Check how many gym workouts exist on this date (unmatched)
            same_date_workouts = conn.execute("""
                SELECT id, duration_minutes FROM gym_workouts
                WHERE date = ? AND garmin_activity_id IS NULL
                ORDER BY id
            """, (w_date,)).fetchall()

            if len(garmin_acts) == 1 and len(same_date_workouts) == 1:
                # Simple 1:1 match
                conn.execute(
                    "UPDATE gym_workouts SET garmin_activity_id = ? WHERE id = ?",
                    (garmin_acts[0][0], w_id)
                )
                matched += 1
            elif len(garmin_acts) >= 1 and len(same_date_workouts) >= 1:
                # Multiple — match by closest duration
                if w_dur and w_dur > 0:
                    best_act = min(
                        garmin_acts,
                        key=lambda a: abs((a[1] or 0) / 60 - w_dur)
                    )
                    # Check this Garmin activity isn't already taken
                    taken = conn.execute(
                        "SELECT COUNT(*) FROM gym_workouts WHERE garmin_activity_id = ?",
                        (best_act[0],)
                    ).fetchone()[0]
                    if not taken:
                        conn.execute(
                            "UPDATE gym_workouts SET garmin_activity_id = ? WHERE id = ?",
                            (best_act[0], w_id)
                        )
                        matched += 1
                    else:
                        no_garmin += 1
                else:
                    # No duration info — take first available
                    for act in garmin_acts:
                        taken = conn.execute(
                            "SELECT COUNT(*) FROM gym_workouts WHERE garmin_activity_id = ?",
                            (act[0],)
                        ).fetchone()[0]
                        if not taken:
                            conn.execute(
                                "UPDATE gym_workouts SET garmin_activity_id = ? WHERE id = ?",
                                (act[0], w_id)
                            )
                            matched += 1
                            break
                    else:
                        no_garmin += 1


    return {
        "matched": matched,
        "already_matched": already,
        "no_garmin": no_garmin,
        "total": len(unmatched) + already,
    }


def get_garmin_match_stats() -> dict:
    """Get stats about Garmin-gym workout matching."""
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM gym_workouts").fetchone()[0]
        matched = conn.execute(
            "SELECT COUNT(*) FROM gym_workouts WHERE garmin_activity_id IS NOT NULL"
        ).fetchone()[0]
        garmin_strength = conn.execute(
            "SELECT COUNT(*) FROM garmin_activities WHERE activity_type = 'strength_training'"
        ).fetchone()[0]
    return {
        "total_workouts": total,
        "matched": matched,
        "unmatched": total - matched,
        "garmin_strength_activities": garmin_strength,
    }


def get_workout_garmin_data(workout_id: int) -> dict | None:
    """Get Garmin activity data for a matched workout."""
    with get_conn() as conn:
        row = conn.execute("""
            SELECT ga.activity_id, ga.duration_seconds, ga.calories,
                   ga.avg_hr, ga.max_hr, ga.training_effect_aerobic,
                   ga.training_effect_anaerobic
            FROM gym_workouts gw
            JOIN garmin_activities ga ON ga.activity_id = gw.garmin_activity_id
            WHERE gw.id = ?
        """, (workout_id,)).fetchone()
        if not row:
            return None
        return {
            "activity_id": row[0],
            "duration_min": round(row[1] / 60) if row[1] else None,
            "calories": row[2],
            "avg_hr": row[3],
            "max_hr": row[4],
            "te_aerobic": row[5],
            "te_anaerobic": row[6],
        }
