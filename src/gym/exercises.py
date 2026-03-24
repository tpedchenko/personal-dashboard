"""Exercise library: CRUD, seed, favourites, display helpers, default data."""
import pandas as pd

from src.database import get_conn, read_sql
from .schema import _gym_table_columns

# ─── Default exercises ────────────────────────────────────────────────────────

_DEFAULT_EXERCISES = [
    # Push
    ("Barbell Bench Press", "chest", "triceps,shoulders", "barbell", "compound", "push", "intermediate"),
    ("Incline Barbell Bench Press", "chest", "triceps,shoulders", "barbell", "compound", "push", "intermediate"),
    ("Dumbbell Bench Press", "chest", "triceps,shoulders", "dumbbell", "compound", "push", "beginner"),
    ("Incline Dumbbell Press", "chest", "triceps,shoulders", "dumbbell", "compound", "push", "intermediate"),
    ("Overhead Press", "shoulders", "triceps", "barbell", "compound", "push", "intermediate"),
    ("Dumbbell Shoulder Press", "shoulders", "triceps", "dumbbell", "compound", "push", "beginner"),
    ("Lateral Raises", "shoulders", None, "dumbbell", "isolation", "push", "beginner"),
    ("Cable Lateral Raises", "shoulders", None, "cable", "isolation", "push", "beginner"),
    ("Front Raises", "shoulders", None, "dumbbell", "isolation", "push", "beginner"),
    ("Tricep Pushdown", "triceps", None, "cable", "isolation", "push", "beginner"),
    ("Overhead Tricep Extension", "triceps", None, "cable", "isolation", "push", "beginner"),
    ("Skull Crushers", "triceps", None, "barbell", "isolation", "push", "intermediate"),
    ("Dips", "chest", "triceps,shoulders", "bodyweight", "compound", "push", "intermediate"),
    ("Cable Flyes", "chest", None, "cable", "isolation", "push", "beginner"),
    ("Dumbbell Flyes", "chest", None, "dumbbell", "isolation", "push", "beginner"),
    ("Close Grip Bench Press", "triceps", "chest,shoulders", "barbell", "compound", "push", "intermediate"),
    # Pull
    ("Barbell Row", "back", "biceps", "barbell", "compound", "pull", "intermediate"),
    ("Dumbbell Row", "back", "biceps", "dumbbell", "compound", "pull", "beginner"),
    ("Pull-ups", "back", "biceps", "bodyweight", "compound", "pull", "intermediate"),
    ("Chin-ups", "back", "biceps", "bodyweight", "compound", "pull", "intermediate"),
    ("Lat Pulldown", "back", "biceps", "cable", "compound", "pull", "beginner"),
    ("Seated Cable Row", "back", "biceps", "cable", "compound", "pull", "beginner"),
    ("T-Bar Row", "back", "biceps", "barbell", "compound", "pull", "intermediate"),
    ("Face Pulls", "shoulders", "back", "cable", "isolation", "pull", "beginner"),
    ("Barbell Curl", "biceps", None, "barbell", "isolation", "pull", "beginner"),
    ("Dumbbell Curl", "biceps", None, "dumbbell", "isolation", "pull", "beginner"),
    ("Hammer Curl", "biceps", "forearms", "dumbbell", "isolation", "pull", "beginner"),
    ("Preacher Curl", "biceps", None, "barbell", "isolation", "pull", "beginner"),
    ("Cable Curl", "biceps", None, "cable", "isolation", "pull", "beginner"),
    ("Rear Delt Flyes", "shoulders", "back", "dumbbell", "isolation", "pull", "beginner"),
    ("Shrugs", "traps", None, "dumbbell", "isolation", "pull", "beginner"),
    ("Deadlift", "back", "legs,glutes", "barbell", "compound", "pull", "advanced"),
    # Legs
    ("Barbell Squat", "quads", "glutes,hamstrings", "barbell", "compound", "push", "intermediate"),
    ("Front Squat", "quads", "glutes", "barbell", "compound", "push", "advanced"),
    ("Leg Press", "quads", "glutes,hamstrings", "machine", "compound", "push", "beginner"),
    ("Romanian Deadlift", "hamstrings", "glutes,back", "barbell", "compound", "pull", "intermediate"),
    ("Leg Curl", "hamstrings", None, "machine", "isolation", "pull", "beginner"),
    ("Leg Extension", "quads", None, "machine", "isolation", "push", "beginner"),
    ("Bulgarian Split Squat", "quads", "glutes", "dumbbell", "compound", "push", "intermediate"),
    ("Lunges", "quads", "glutes,hamstrings", "dumbbell", "compound", "push", "beginner"),
    ("Hip Thrust", "glutes", "hamstrings", "barbell", "compound", "push", "intermediate"),
    ("Calf Raises", "calves", None, "machine", "isolation", "push", "beginner"),
    ("Seated Calf Raises", "calves", None, "machine", "isolation", "push", "beginner"),
    ("Hack Squat", "quads", "glutes", "machine", "compound", "push", "intermediate"),
    # Core
    ("Plank", "core", None, "bodyweight", "isolation", "static", "beginner"),
    ("Cable Crunch", "core", None, "cable", "isolation", "pull", "beginner"),
    ("Hanging Leg Raise", "core", None, "bodyweight", "isolation", "pull", "intermediate"),
    ("Ab Wheel Rollout", "core", None, "bodyweight", "compound", "push", "intermediate"),
]


_MUSCLE_GROUP_ICONS = {
    "chest": "\U0001f4aa",       # 💪
    "back": "\U0001f519",        # 🔙
    "shoulders": "\U0001fac1",   # 🫁
    "biceps": "\U0001f4aa",      # 💪
    "triceps": "\U0001f4aa",     # 💪
    "traps": "\U0001f519",       # 🔙
    "quads": "\U0001f9b5",       # 🦵
    "hamstrings": "\U0001f9b5",  # 🦵
    "glutes": "\U0001f9b5",      # 🦵
    "calves": "\U0001f9b5",      # 🦵
    "core": "\U0001f3af",        # 🎯
    "cardio": "\U0001f3c3",      # 🏃
    "forearms": "\U0001f4aa",    # 💪
}


def get_muscle_group_icon(muscle_group: str | None) -> str:
    """Return emoji icon for a muscle group."""
    if not muscle_group:
        return "\U0001f3cb\ufe0f"  # 🏋️
    return _MUSCLE_GROUP_ICONS.get(muscle_group.lower(), "\U0001f3cb\ufe0f")


def get_exercise_display_name(name: str) -> str:
    """Get localized exercise name. Checks name_ua column first, then i18n."""
    from src.i18n import get_current_lang
    if get_current_lang() == "uk":
        # Try to get name_ua from DB cache
        _ua_map = _get_exercise_ua_map()
        if name in _ua_map and _ua_map[name]:
            return _ua_map[name]
    from src.i18n import t
    translated = t(f"exercises.{name}")
    return translated if translated != f"exercises.{name}" else name


_exercise_ua_cache: dict | None = None

def _get_exercise_ua_map() -> dict:
    """Cache name -> name_ua mapping (module-level cache)."""
    global _exercise_ua_cache
    if _exercise_ua_cache is not None:
        return _exercise_ua_cache
    with get_conn() as conn:
        cols = _gym_table_columns(conn, "gym_exercises")
        if "name_ua" not in cols:
            _exercise_ua_cache = {}
            return _exercise_ua_cache
        rows = conn.execute("SELECT name, name_ua FROM gym_exercises WHERE name_ua IS NOT NULL").fetchall()
    _exercise_ua_cache = {r[0]: r[1] for r in rows}
    return _exercise_ua_cache


def get_exercise_display_with_icon(name: str, muscle_group: str | None = None) -> str:
    """Get localized exercise name with muscle group emoji prefix."""
    icon = get_muscle_group_icon(muscle_group)
    display_name = get_exercise_display_name(name)
    return f"{icon} {display_name}"


def seed_exercises(_force: bool = False):
    """Insert default exercises if table is empty."""
    if not _force:
        try:
            import streamlit as st
            if st.session_state.get("_gym_exercises_seeded"):
                return
        except Exception:
            pass
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM gym_exercises").fetchone()[0]
        if count > 0:
            try:
                import streamlit as st
                st.session_state["_gym_exercises_seeded"] = True
            except Exception:
                pass
            return
        for name, muscle, secondary, equip, etype, force, level in _DEFAULT_EXERCISES:
            conn.execute("""
                INSERT OR IGNORE INTO gym_exercises
                (name, muscle_group, secondary_muscles, equipment, exercise_type, force_type, level)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (name, muscle, secondary, equip, etype, force, level))
    try:
        import streamlit as st
        st.session_state["_gym_exercises_seeded"] = True
    except Exception:
        pass



def add_custom_exercise(name: str, muscle_group: str, equipment: str) -> int | None:
    """Add a custom exercise to the user's personal library.

    Returns exercise ID on success, None if exercise already exists.
    """
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM gym_exercises WHERE name = ?", (name,)
        ).fetchone()
        if existing:
            return None
        conn.execute("""
            INSERT INTO gym_exercises
            (name, muscle_group, equipment, exercise_type, is_custom)
            VALUES (?, ?, ?, 'compound', 1)
        """, (name, muscle_group, equipment))
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def delete_custom_exercise(exercise_id: int) -> bool:
    """Delete a custom exercise. Only deletes if is_custom=1."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT is_custom FROM gym_exercises WHERE id = ?", (exercise_id,)
        ).fetchone()
        if not row or not row[0]:
            return False
        conn.execute("DELETE FROM gym_exercises WHERE id = ? AND is_custom = 1", (exercise_id,))
    return True


def get_custom_exercises() -> pd.DataFrame:
    """Get all custom (user-added) exercises."""
    with get_conn() as conn:
        return read_sql(
            "SELECT * FROM gym_exercises WHERE is_custom = 1 ORDER BY name", conn
        )


def get_exercises(muscle_group: str | None = None) -> pd.DataFrame:
    """Get all exercises, optionally filtered by muscle group."""
    with get_conn() as conn:
        if muscle_group:
            df = read_sql(
                "SELECT * FROM gym_exercises WHERE muscle_group = ? ORDER BY name",
                conn, [muscle_group]
            )
        else:
            df = read_sql("SELECT * FROM gym_exercises ORDER BY name", conn)
    return df


def get_exercises_by_frequency() -> pd.DataFrame:
    """Get all exercises sorted by favourites first, then usage frequency, then alphabetically."""
    with get_conn() as conn:
        # WHERE 1=1 ensures _inject_user_id appends AND user_id = %s here
        # instead of before the subquery's GROUP BY (which would break PG).
        return read_sql("""
            SELECT e.*, COALESCE(freq.times_performed, 0) as times_performed
            FROM gym_exercises e
            LEFT JOIN (
                SELECT we.exercise_id, COUNT(we.id) as times_performed
                FROM gym_workout_exercises we
                GROUP BY we.exercise_id
            ) freq ON freq.exercise_id = e.id
            WHERE 1=1
            ORDER BY COALESCE(e.is_favourite, 0) DESC, times_performed DESC, e.name
        """, conn)


def get_frequent_exercises(limit: int = 10) -> pd.DataFrame:
    """Get favourite + most frequently performed exercises."""
    with get_conn() as conn:
        return read_sql("""
            SELECT e.name, e.muscle_group, COALESCE(e.is_favourite, 0) as is_favourite,
                   COUNT(we.id) as times_performed,
                   MAX(w.date) as last_performed,
                   MAX(s.weight_kg) as max_weight
            FROM gym_workout_exercises we
            JOIN gym_exercises e ON e.id = we.exercise_id
            JOIN gym_workouts w ON w.id = we.workout_id
            LEFT JOIN gym_sets s ON s.workout_exercise_id = we.id AND s.is_warmup = 0
            GROUP BY e.id
            ORDER BY COALESCE(e.is_favourite, 0) DESC, times_performed DESC
            LIMIT ?
        """, conn, [limit])


def get_exercise_history(exercise_name: str, days: int = 365) -> pd.DataFrame:
    """Get history of an exercise: max weight per workout."""
    from datetime import date, timedelta
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_conn() as conn:
        df = read_sql("""
            SELECT w.date, MAX(s.weight_kg) as max_weight,
                   MAX(s.reps) as max_reps,
                   SUM(s.weight_kg * s.reps) as total_volume,
                   COUNT(s.id) as num_sets
            FROM gym_sets s
            JOIN gym_workout_exercises we ON we.id = s.workout_exercise_id
            JOIN gym_exercises e ON e.id = we.exercise_id
            JOIN gym_workouts w ON w.id = we.workout_id
            WHERE e.name = ? AND w.date >= ? AND s.is_warmup = 0
            GROUP BY w.date
            ORDER BY w.date
        """, conn, [exercise_name, since])
    return df


def get_previous_exercise_sets(exercise_name: str, exclude_workout_id: int | None = None) -> list[dict]:
    """Get sets from the most recent workout for this exercise (excluding current workout).

    Returns list of dicts: [{set_num, weight_kg, reps, intensity}, ...]
    """
    with get_conn() as conn:
        exclude_clause = "AND w.id != ?" if exclude_workout_id else ""
        params = [exercise_name]
        if exclude_workout_id:
            params.append(exclude_workout_id)

        row = conn.execute(f"""
            SELECT w.id FROM gym_workouts w
            JOIN gym_workout_exercises we ON we.workout_id = w.id
            JOIN gym_exercises e ON e.id = we.exercise_id
            JOIN gym_sets s ON s.workout_exercise_id = we.id
            WHERE e.name = ? {exclude_clause}
            ORDER BY w.date DESC, w.id DESC
            LIMIT 1
        """, params).fetchone()

        if not row:
            return []

        prev_w_id = row[0]
        sets = conn.execute("""
            SELECT s.set_num, s.weight_kg, s.reps, s.intensity
            FROM gym_sets s
            JOIN gym_workout_exercises we ON we.id = s.workout_exercise_id
            JOIN gym_exercises e ON e.id = we.exercise_id
            WHERE we.workout_id = ? AND e.name = ?
            ORDER BY s.set_num
        """, (prev_w_id, exercise_name)).fetchall()

    return [{"set_num": s[0], "weight_kg": s[1], "reps": s[2],
             "intensity": s[3] or "normal"} for s in sets]


def add_exercises_from_history():
    """Remove unused default exercises that have never been performed
    and are not referenced by any program."""
    with get_conn() as conn:
        conn.execute("""
            DELETE FROM gym_exercises
            WHERE NOT COALESCE(is_custom, false)
            AND id NOT IN (SELECT DISTINCT exercise_id FROM gym_workout_exercises)
            AND id NOT IN (SELECT DISTINCT exercise_id FROM gym_program_exercises)
        """)


# ─── Favourite exercises ──────────────────────────────────────────────────────

def toggle_exercise_favourite(exercise_id: int) -> bool:
    """Toggle favourite status for an exercise. Returns new is_favourite value."""
    with get_conn() as conn:
        cur = conn.execute("SELECT COALESCE(is_favourite, 0) FROM gym_exercises WHERE id = ?", (exercise_id,)).fetchone()
        if not cur:
            return False
        new_val = 0 if cur[0] else 1
        conn.execute("UPDATE gym_exercises SET is_favourite = ? WHERE id = ?", (new_val, exercise_id))
    return bool(new_val)


def auto_favourite_exercises():
    """Auto-star exercises used 4+ times in the last 30 days."""
    from datetime import date, timedelta
    since = (date.today() - timedelta(days=30)).isoformat()
    with get_conn() as conn:
        conn.execute("""
            UPDATE gym_exercises SET is_favourite = 1
            WHERE id IN (
                SELECT we.exercise_id
                FROM gym_workout_exercises we
                JOIN gym_workouts w ON w.id = we.workout_id
                WHERE w.date >= ?
                GROUP BY we.exercise_id
                HAVING COUNT(we.id) >= 4
            ) AND COALESCE(is_favourite, 0) = 0
        """, (since,))


# ─── Exercise rename / standardization maps ──────────────────────────────────

_EXERCISE_RENAME_MAP = {
    # Chest
    "Barbell Bench Press - Medium Grip": "Barbell Bench Press",
    "Barbell Incline Bench Press - Medium Grip": "Incline Barbell Bench Press",
    "Butterfly": "Pec Deck",
    "Cable Crossover": "Cable Flyes",
    "Dumbbell Bench Press": "Dumbbell Bench Press",
    "Hammer Grip Incline DB Bench Press": "Incline Dumbbell Press",
    "Include press in TR": "Machine Chest Press",
    "Leverage Incline Chest Press": "Machine Incline Press",
    "Smith Machine Bench Press": "Smith Machine Bench Press",
    "Smith Machine Incline Bench Press": "Smith Machine Incline Press",
    # Back
    "Bent Over Barbell Row": "Barbell Row",
    "Bent Over Two-Dumbbell Row": "Dumbbell Row",
    "One-Arm Dumbbell Row": "Dumbbell Row",
    "Reverse Grip Bent-Over Rows": "Barbell Row",
    "Seated Cable Rows": "Seated Cable Row",
    "V-Bar Pulldown": "Lat Pulldown",
    "Wide-Grip Lat Pulldown": "Lat Pulldown",
    "Underhand Cable Pulldowns": "Lat Pulldown",
    "Straight-Arm Pulldown": "Straight Arm Pulldown",
    "Pullups": "Pull-ups",
    "Chin-Up": "Chin-ups",
    "Hyperextensions (Back Extensions)": "Back Extension",
    "Clean Deadlift": "Deadlift",
    # Ukrainian -> English
    "вертикальна тяга широким хватом в тренажері": "Machine Lat Pulldown",
    "тяга широких хватом горизонтального блоку": "Seated Cable Row",
    "тяга широким хватим": "Barbell Row",
    "тяга в тренажері": "Machine Row",
    "тяга однією рукою": "Dumbbell Row",
    "тренажер hammer": "Hammer Strength Row",
    "тяга на трапеції на лаві": "Dumbbell Shrugs",
    # Shoulders
    "Standing Military Press": "Overhead Press",
    "Machine Shoulder (Military) Press": "Machine Shoulder Press",
    "Barbell Shoulder Press": "Overhead Press",
    "Arnold Dumbbell Press": "Arnold Press",
    "Standing Low-Pulley Deltoid Raise": "Cable Lateral Raises",
    "Power Partials": "Lateral Raises",
    "Upright Barbell Row": "Upright Row",
    "Upright Cable Row": "Cable Upright Row",
    "Face Pull": "Face Pulls",
    "Bent Over Dumbbell Rear Delt Raise With Head On Bench": "Rear Delt Flyes",
    "Seated Bent-Over Rear Delt Raise": "Rear Delt Flyes",
    "Dumbbell Lying Rear Lateral Raise": "Rear Delt Flyes",
    "Bent Over Low-Pulley Side Lateral": "Cable Rear Delt Fly",
    # Ukrainian shoulders
    "махи на плечі сидячи в тренажері": "Machine Lateral Raises",
    "розводка в бабочка на задню дельту": "Machine Rear Delt Fly",
    "тяга на задню дельту в тренажері": "Machine Rear Delt Fly",
    # Biceps
    "EZ-Bar Curl": "EZ-Bar Curl",
    "Hammer Curls": "Hammer Curl",
    "Standing Biceps Cable Curl": "Cable Curl",
    "Concentration Curls": "Concentration Curl",
    "Dumbbell Bicep Curl": "Dumbbell Curl",
    "Flexor Incline Dumbbell Curls": "Incline Dumbbell Curl",
    "Incline Dumbbell Curl": "Incline Dumbbell Curl",
    "Barbell Curls Lying Against An Incline": "Incline Barbell Curl",
    # Ukrainian biceps
    "згинання рук одночасно в тренажері": "Machine Bicep Curl",
    # Triceps
    "Seated Triceps Press": "Overhead Tricep Extension",
    "Dips - Triceps Version": "Dips",
    "Triceps Pushdown": "Tricep Pushdown",
    "Triceps Pushdown - Rope Attachment": "Rope Tricep Pushdown",
    "Triceps Pushdown - V-Bar Attachment": "Tricep Pushdown",
    "Lying Triceps Press": "Skull Crushers",
    "Lying Close-Grip Barbell Triceps Extension Behind The Head": "Skull Crushers",
    "Close-Grip Barbell Bench Press": "Close Grip Bench Press",
    "Lying Dumbbell Tricep Extension": "Dumbbell Tricep Extension",
    # Legs
    "Barbell Full Squat": "Barbell Squat",
    "Leg Extensions": "Leg Extension",
    "Dumbbell Lunges": "Lunges",
    "Barbell Lunge": "Lunges",
    "Lying Leg Curls": "Leg Curl",
    "Seated Legs Curls": "Leg Curl",
    "Smith Machine Squat": "Smith Machine Squat",
    "Standing Barbell Calf Raise": "Calf Raises",
    "Barbell Seated Calf Raise": "Seated Calf Raises",
    "Smith Machine Reverse Calf Raises": "Calf Raises",
    "Seated Calf Raise": "Seated Calf Raises",
    "Thigh Adductor": "Hip Adductor",
    "Thigh Abductor": "Hip Abductor",
    # Core
    "Exercise Ball Crunch": "Cable Crunch",
    "Hanging Pike": "Hanging Leg Raise",
    "Crunches": "Crunches",
    "Decline Crunch": "Crunches",
    "Ab Crunch Machine": "Machine Crunch",
    "Standing Cable Wood Chop": "Cable Woodchop",
    "Standing Lateral Stretch": "Oblique Stretch",
    # Traps
    "Cable Shrugs": "Shrugs",
    "Smith Machine Shrug": "Shrugs",
    "Standing Dumbbell Upright Row": "Dumbbell Upright Row",
}

_EXERCISE_MUSCLE_FIX = {
    "Leg Curl": "hamstrings",
    "Hip Adductor": "glutes",
    "Hip Abductor": "glutes",
    "Shrugs": "traps",
    "Hanging Leg Raise": "core",
    "Oblique Stretch": "core",
}

_EXERCISE_EQUIPMENT_FIX = {
    "Machine Lateral Raises": "machine",
    "Machine Lat Pulldown": "machine",
    "Machine Rear Delt Fly": "machine",
    "Machine Chest Press": "machine",
    "Machine Row": "machine",
    "Hammer Strength Row": "machine",
    "Machine Bicep Curl": "machine",
    "Dumbbell Shrugs": "dumbbell",
}


def standardize_exercises():
    """Rename exercises to standard names and merge duplicates."""
    with get_conn() as conn:
        for old_name, new_name in _EXERCISE_RENAME_MAP.items():
            old_row = conn.execute(
                "SELECT id FROM gym_exercises WHERE name = ?", (old_name,)
            ).fetchone()
            if not old_row:
                continue

            old_id = old_row[0]
            new_row = conn.execute(
                "SELECT id FROM gym_exercises WHERE name = ?", (new_name,)
            ).fetchone()

            if new_row and new_row[0] != old_id:
                # Merge: move workout_exercises from old to new
                conn.execute(
                    "UPDATE gym_workout_exercises SET exercise_id = ? WHERE exercise_id = ?",
                    (new_row[0], old_id),
                )
                # Move program_exercises too
                conn.execute(
                    "UPDATE gym_program_exercises SET exercise_id = ? WHERE exercise_id = ?",
                    (new_row[0], old_id),
                )
                conn.execute("DELETE FROM gym_exercises WHERE id = ?", (old_id,))
            else:
                # Just rename
                conn.execute(
                    "UPDATE gym_exercises SET name = ? WHERE id = ?",
                    (new_name, old_id),
                )

        # Fix muscle groups
        for name, muscle in _EXERCISE_MUSCLE_FIX.items():
            conn.execute(
                "UPDATE gym_exercises SET muscle_group = ? WHERE name = ?",
                (muscle, name),
            )

        # Fix missing equipment
        for name, equip in _EXERCISE_EQUIPMENT_FIX.items():
            conn.execute(
                "UPDATE gym_exercises SET equipment = ? WHERE name = ? AND (equipment IS NULL OR equipment = '')",
                (equip, name),
            )


# ─── Import from GymUp Realm binary ─────────────────────────────────────────

def import_gymup_data(realm_path: str) -> dict:
    """Try to extract workout data from GymUp Realm database binary.

    This is a best-effort parser since Realm binaries require the Realm SDK.
    Returns summary of imported data.
    """
    import re
    from pathlib import Path

    path = Path(realm_path)
    if not path.exists():
        return {"error": "File not found"}

    content = path.read_bytes()

    # Extract exercise names (known pattern from analysis)
    strings = []
    current = b""
    for byte in content:
        if 32 <= byte < 127:
            current += bytes([byte])
        else:
            if 4 < len(current) < 200:
                try:
                    s = current.decode('ascii', errors='ignore').strip()
                    if s:
                        strings.append(s)
                except Exception:
                    pass
                current = b""

    # Find exercise names — they appear as multi-word capitalized phrases
    exercise_names = set()
    for s in strings:
        words = s.split()
        if 2 <= len(words) <= 7 and len(s) < 80:
            # Must start with alpha and look like an exercise name
            if not s[0].isalpha():
                continue
            cap_count = sum(1 for w in words if w and w[0].isupper())
            if cap_count >= len(words) * 0.5:
                # Filter known non-exercise strings
                if not any(x in s.lower() for x in ['set the', 'place a', 'begin', 'secure',
                                                       'training', 'program', 'workout', 'for',
                                                       'your', 'the ', 'this', 'that', 'from',
                                                       'with', 'http']):
                    exercise_names.add(s)

    # Try to match with our exercise library
    with get_conn() as conn:
        existing = {r[0].lower() for r in conn.execute("SELECT name FROM gym_exercises").fetchall()}
        imported = 0
        for name in sorted(exercise_names):
            if name.lower() not in existing and len(name) > 8:
                # Guess muscle group from name
                mg = _guess_muscle_group(name)
                equip = _guess_equipment(name)
                try:
                    conn.execute("""
                        INSERT OR IGNORE INTO gym_exercises
                        (name, muscle_group, equipment, is_custom)
                        VALUES (?, ?, ?, 0)
                    """, (name, mg, equip))
                    imported += 1
                except Exception:
                    pass


    return {"exercises_found": len(exercise_names), "imported": imported}


def _guess_muscle_group(name: str) -> str:
    n = name.lower()
    if any(x in n for x in ["bench", "chest", "pec", "fly"]):
        return "chest"
    if any(x in n for x in ["squat", "leg press", "lunge", "quad"]):
        return "quads"
    if any(x in n for x in ["curl", "bicep"]):
        return "biceps"
    if any(x in n for x in ["tricep", "pushdown", "skull"]):
        return "triceps"
    if any(x in n for x in ["row", "pulldown", "pull-up", "lat", "back"]):
        return "back"
    if any(x in n for x in ["press", "shoulder", "lateral", "delt"]):
        return "shoulders"
    if any(x in n for x in ["deadlift", "rdl", "hamstring", "leg curl"]):
        return "hamstrings"
    if any(x in n for x in ["calf", "calve"]):
        return "calves"
    if any(x in n for x in ["crunch", "plank", "ab ", "core"]):
        return "core"
    if any(x in n for x in ["glute", "hip thrust"]):
        return "glutes"
    return "other"


def _guess_equipment(name: str) -> str:
    n = name.lower()
    if "barbell" in n or "bar " in n:
        return "barbell"
    if "dumbbell" in n or "db " in n:
        return "dumbbell"
    if "cable" in n or "pulley" in n:
        return "cable"
    if "machine" in n or "smith" in n:
        return "machine"
    if "kettlebell" in n:
        return "kettlebell"
    if any(x in n for x in ["pull-up", "push-up", "dip", "plank", "crunch"]):
        return "bodyweight"
    return "other"
