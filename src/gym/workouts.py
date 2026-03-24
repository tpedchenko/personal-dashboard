"""Workout CRUD: create, detail, sets, finish, delete, cleanup, presets."""
from datetime import date, timedelta, datetime

import pandas as pd

from src.database import get_conn, read_sql


def get_workouts(days: int = 30) -> pd.DataFrame:
    """Get recent workouts including those with exercises but no sets yet."""
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        df = read_sql("""
            SELECT w.*,
                   COUNT(DISTINCT we.id) as exercise_count,
                   COUNT(s.id) as total_sets
            FROM gym_workouts w
            LEFT JOIN gym_workout_exercises we ON we.workout_id = w.id
            LEFT JOIN gym_sets s ON s.workout_exercise_id = we.id
            WHERE w.date >= ?
            GROUP BY w.id
            HAVING COUNT(DISTINCT we.id) > 0 OR COUNT(s.id) > 0
            ORDER BY w.date DESC
        """, conn, [since])
    return df


def get_workout_detail(workout_id: int) -> dict:
    """Get full workout detail with exercises and sets."""
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT * FROM gym_workouts WHERE id = ?", (workout_id,)
        )
        workout = cur.fetchone()
        if not workout:
            return {}

        w_cols = [d[0] for d in cur.description]
        w = dict(zip(w_cols, workout))

        exercises = conn.execute("""
            SELECT we.id, we.order_num, we.notes, we.superset_group,
                   e.name, e.muscle_group, e.equipment
            FROM gym_workout_exercises we
            JOIN gym_exercises e ON e.id = we.exercise_id
            WHERE we.workout_id = ?
            ORDER BY we.order_num
        """, (workout_id,)).fetchall()

        result = {**w, "exercises": []}
        for ex in exercises:
            we_id, order, notes, ss_group, name, muscle, equip = ex
            sets = conn.execute("""
                SELECT id, set_num, weight_kg, reps, is_warmup, is_failure, rpe, notes, intensity
                FROM gym_sets WHERE workout_exercise_id = ?
                ORDER BY set_num
            """, (we_id,)).fetchall()

            result["exercises"].append({
                "workout_exercise_id": we_id,
                "name": name, "muscle_group": muscle, "equipment": equip,
                "order": order, "notes": notes, "superset_group": ss_group,
                "sets": [{"id": s[0], "set_num": s[1], "weight_kg": s[2], "reps": s[3],
                          "is_warmup": s[4], "is_failure": s[5], "rpe": s[6],
                          "notes": s[7], "intensity": s[8] or "normal"} for s in sets],
            })

    return result


def create_workout(workout_date: str, program_type: str = None,
                   workout_name: str = None, notes: str = None,
                   duration_minutes: int = None,
                   garmin_activity_id: int = None) -> int:
    """Create a new workout and return its ID."""
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO gym_workouts (date, program_type, workout_name, notes, start_time, duration_minutes, garmin_activity_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (workout_date, program_type, workout_name, notes,
              datetime.now().strftime("%H:%M"), duration_minutes, garmin_activity_id))
        wid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return wid


def add_exercise_to_workout(workout_id: int, exercise_id: int, order_num: int = 0) -> int:
    """Add an exercise to a workout, return workout_exercise_id."""
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO gym_workout_exercises (workout_id, exercise_id, order_num)
            VALUES (?, ?, ?)
        """, (workout_id, exercise_id, order_num))
        weid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return weid


def add_set(workout_exercise_id: int, set_num: int, weight_kg: float = None,
            reps: int = None, is_warmup: bool = False, rpe: float = None,
            intensity: str = "normal") -> int:
    """Record a set."""
    # Map intensity to is_warmup for backwards compat
    _is_warmup = True if intensity == "warmup" or is_warmup else False
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO gym_sets (workout_exercise_id, set_num, weight_kg, reps, is_warmup, rpe, intensity)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (workout_exercise_id, set_num, weight_kg, reps, _is_warmup, rpe, intensity))
        sid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return sid


def update_set(set_id: int, weight_kg: float = None, reps: int = None,
               intensity: str = None):
    """Update an existing set."""
    with get_conn() as conn:
        fields, vals = [], []
        if weight_kg is not None:
            fields.append("weight_kg = ?")
            vals.append(weight_kg)
        if reps is not None:
            fields.append("reps = ?")
            vals.append(reps)
        if intensity is not None:
            fields.append("intensity = ?")
            vals.append(intensity)
            fields.append("is_warmup = ?")
            vals.append(1 if intensity == "warmup" else 0)
        if fields:
            vals.append(set_id)
            conn.execute(f"UPDATE gym_sets SET {', '.join(fields)} WHERE id = ?", vals)



def delete_set(set_id: int):
    """Delete a set."""
    with get_conn() as conn:
        conn.execute("DELETE FROM gym_sets WHERE id = ?", (set_id,))



def delete_workout(workout_id: int):
    """Delete a workout and all its exercises/sets (CASCADE)."""
    with get_conn() as conn:
        # Manual cascade since SQLite FK enforcement varies
        we_ids = [r[0] for r in conn.execute(
            "SELECT id FROM gym_workout_exercises WHERE workout_id = ?", (workout_id,)
        ).fetchall()]
        for we_id in we_ids:
            conn.execute("DELETE FROM gym_sets WHERE workout_exercise_id = ?", (we_id,))
        conn.execute("DELETE FROM gym_workout_exercises WHERE workout_id = ?", (workout_id,))
        conn.execute("DELETE FROM gym_workouts WHERE id = ?", (workout_id,))



def remove_exercise_from_workout(workout_exercise_id: int):
    """Remove an exercise and its sets from a workout."""
    with get_conn() as conn:
        conn.execute("DELETE FROM gym_sets WHERE workout_exercise_id = ?", (workout_exercise_id,))
        conn.execute("DELETE FROM gym_workout_exercises WHERE id = ?", (workout_exercise_id,))



def cleanup_empty_exercises():
    """Remove workout_exercises that have zero recorded sets (only for finished workouts)."""
    with get_conn() as conn:
        conn.execute("""
            DELETE FROM gym_workout_exercises
            WHERE id NOT IN (SELECT DISTINCT workout_exercise_id FROM gym_sets)
            AND workout_id IN (SELECT id FROM gym_workouts WHERE end_time IS NOT NULL)
        """)



def finish_workout(workout_id: int, duration_minutes: int = None):
    """Mark workout as complete."""
    with get_conn() as conn:
        conn.execute("""
            UPDATE gym_workouts SET end_time = ?, duration_minutes = ?
            WHERE id = ?
        """, (datetime.now().strftime("%H:%M"), duration_minutes, workout_id))



def get_workout_calendar(year: int, month: int) -> list[dict]:
    """Get workouts for a specific month (for calendar view)."""
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"

    with get_conn() as conn:
        rows = conn.execute("""
            SELECT w.date, w.workout_name, w.program_type,
                   COUNT(DISTINCT we.id) as exercises,
                   GROUP_CONCAT(DISTINCT e.muscle_group) as muscles,
                   w.duration_minutes, w.garmin_activity_id
            FROM gym_workouts w
            LEFT JOIN gym_workout_exercises we ON we.workout_id = w.id
            LEFT JOIN gym_exercises e ON e.id = we.exercise_id
            WHERE w.date >= ? AND w.date < ?
            GROUP BY w.id
            ORDER BY w.date
        """, (start, end)).fetchall()

    return [{"date": r[0], "name": r[1], "type": r[2],
             "exercises": r[3], "muscles": r[4], "duration": r[5],
             "garmin_activity_id": r[6]} for r in rows]


# Preset exercises for each workout type
_WORKOUT_PRESETS = {
    "Push Day": [
        "Barbell Bench Press", "Incline Dumbbell Press", "Overhead Press",
        "Lateral Raises", "Tricep Pushdown", "Overhead Tricep Extension",
    ],
    "Pull Day": [
        "Barbell Row", "Lat Pulldown", "Seated Cable Row",
        "Face Pulls", "Barbell Curl", "Hammer Curl",
    ],
    "Legs": [
        "Barbell Squat", "Romanian Deadlift", "Leg Press",
        "Leg Curl", "Leg Extension", "Calf Raises",
    ],
    "Full Body": [
        "Barbell Bench Press", "Barbell Row", "Overhead Press",
        "Barbell Squat", "Romanian Deadlift", "Barbell Curl",
    ],
}


def start_workout_by_type(workout_type: str, workout_date: str | None = None) -> int:
    """Create a workout from a preset type (Push Day, Pull Day, Legs, Full Body)."""
    exercises = _WORKOUT_PRESETS.get(workout_type, [])
    w_id = create_workout(
        workout_date=workout_date or date.today().isoformat(),
        workout_name=workout_type,
    )
    with get_conn() as conn:
        for order, ex_name in enumerate(exercises, 1):
            ex_row = conn.execute(
                "SELECT id FROM gym_exercises WHERE name = ?", (ex_name,)
            ).fetchone()
            if ex_row:
                add_exercise_to_workout(w_id, ex_row[0], order)
    return w_id


def normalize_workout_names():
    """Rename historical workouts: anything not push/pull/legs -> Full Body."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, workout_name, program_type FROM gym_workouts"
        ).fetchall()
        for row_id, name, ptype in rows:
            if not name:
                continue
            lower = (name or "").lower()
            if "push" in lower:
                new_name = "Push Day"
            elif "pull" in lower:
                new_name = "Pull Day"
            elif "leg" in lower:
                new_name = "Legs"
            else:
                new_name = "Full Body"
            if name != new_name:
                conn.execute(
                    "UPDATE gym_workouts SET workout_name = ? WHERE id = ?",
                    (new_name, row_id),
                )


def classify_workouts():
    """Classify workouts as Push/Pull/Legs/Arms/Full Body based on exercise counts."""
    _PUSH_MUSCLES = {"chest", "shoulders", "triceps"}
    _PULL_MUSCLES = {"back", "biceps", "traps"}
    _LEG_MUSCLES = {"quads", "hamstrings", "glutes", "calves"}

    with get_conn() as conn:
        workouts = conn.execute("""
            SELECT w.id, w.workout_name,
                   GROUP_CONCAT(e.muscle_group, ',') as all_muscles
            FROM gym_workouts w
            JOIN gym_workout_exercises we ON we.workout_id = w.id
            JOIN gym_exercises e ON e.id = we.exercise_id
            GROUP BY w.id
        """).fetchall()

        for w_id, w_name, muscles_str in workouts:
            if not muscles_str:
                continue
            # Count exercises per category (not unique groups, actual exercise count)
            all_muscles = [m.strip() for m in muscles_str.split(",") if m.strip()]
            push_n = sum(1 for m in all_muscles if m in _PUSH_MUSCLES)
            pull_n = sum(1 for m in all_muscles if m in _PULL_MUSCLES)
            leg_n = sum(1 for m in all_muscles if m in _LEG_MUSCLES)
            total = push_n + pull_n + leg_n

            if total == 0:
                new_name = "Workout"
            elif leg_n > push_n and leg_n > pull_n:
                new_name = "Legs"
            elif push_n > pull_n and push_n > leg_n:
                new_name = "Push Day"
            elif pull_n > push_n and pull_n > leg_n:
                new_name = "Pull Day"
            elif push_n > 0 and pull_n > 0 and leg_n > 0:
                new_name = "Full Body"
            elif push_n > 0 and pull_n > 0:
                new_name = "Upper Body"
            elif push_n == pull_n == leg_n:
                new_name = "Full Body"
            else:
                new_name = "Workout"

            conn.execute(
                "UPDATE gym_workouts SET workout_name = ? WHERE id = ?",
                (new_name, w_id),
            )
