"""Gym database schema: CREATE TABLE statements, init_gym_db(), migrations."""
import sqlite3

from src.database import get_conn
from src.db_backend import is_postgres

# ─── Database schema ─────────────────────────────────────────────────────────

CREATE_GYM_EXERCISES_SQL = """
CREATE TABLE IF NOT EXISTS gym_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    muscle_group TEXT,
    secondary_muscles TEXT,
    equipment TEXT,
    exercise_type TEXT,
    force_type TEXT,
    level TEXT DEFAULT 'intermediate',
    description TEXT,
    is_custom INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)"""

CREATE_GYM_WORKOUTS_SQL = """
CREATE TABLE IF NOT EXISTS gym_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    program_type TEXT,
    workout_name TEXT,
    notes TEXT,
    duration_minutes INTEGER,
    garmin_activity_id INTEGER,
    calories INTEGER,
    avg_hr INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)"""

CREATE_GYM_WORKOUT_EXERCISES_SQL = """
CREATE TABLE IF NOT EXISTS gym_workout_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL REFERENCES gym_workouts(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES gym_exercises(id),
    order_num INTEGER DEFAULT 0,
    notes TEXT,
    superset_group INTEGER
)"""

CREATE_GYM_SETS_SQL = """
CREATE TABLE IF NOT EXISTS gym_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_exercise_id INTEGER NOT NULL REFERENCES gym_workout_exercises(id) ON DELETE CASCADE,
    set_num INTEGER NOT NULL,
    weight_kg REAL,
    reps INTEGER,
    is_warmup INTEGER DEFAULT 0,
    is_failure INTEGER DEFAULT 0,
    rest_seconds INTEGER,
    rpe REAL,
    notes TEXT
)"""

CREATE_GYM_PROGRAMS_SQL = """
CREATE TABLE IF NOT EXISTS gym_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    program_type TEXT,
    days_per_week INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)"""

CREATE_GYM_PROGRAM_DAYS_SQL = """
CREATE TABLE IF NOT EXISTS gym_program_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL REFERENCES gym_programs(id) ON DELETE CASCADE,
    day_num INTEGER NOT NULL,
    day_name TEXT NOT NULL,
    focus TEXT
)"""

CREATE_GYM_PROGRAM_EXERCISES_SQL = """
CREATE TABLE IF NOT EXISTS gym_program_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_day_id INTEGER NOT NULL REFERENCES gym_program_days(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES gym_exercises(id),
    order_num INTEGER DEFAULT 0,
    target_sets INTEGER DEFAULT 3,
    target_reps TEXT DEFAULT '8-12',
    superset_group INTEGER
)"""

_GYM_TABLES = [
    CREATE_GYM_EXERCISES_SQL,
    CREATE_GYM_WORKOUTS_SQL,
    CREATE_GYM_WORKOUT_EXERCISES_SQL,
    CREATE_GYM_SETS_SQL,
    CREATE_GYM_PROGRAMS_SQL,
    CREATE_GYM_PROGRAM_DAYS_SQL,
    CREATE_GYM_PROGRAM_EXERCISES_SQL,
]


def _gym_table_columns(conn, table: str) -> list[str]:
    """Get column names for a gym table (works with both SQLite and PostgreSQL)."""
    from src.db_backend import is_postgres
    if is_postgres():
        from src.db_backend import pg_table_info
        return [r[1] for r in pg_table_info(conn, table)]
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def init_gym_db():
    """Create gym tables if they don't exist."""
    with get_conn() as conn:
        for sql in _GYM_TABLES:
            conn.execute(sql)
        # Migration: add intensity column to gym_sets
        cols = _gym_table_columns(conn, "gym_sets")
        if "intensity" not in cols:
            conn.execute("ALTER TABLE gym_sets ADD COLUMN intensity TEXT DEFAULT 'normal'")
        # Migration: add is_favourite column to gym_exercises
        ex_cols = _gym_table_columns(conn, "gym_exercises")
        if "is_favourite" not in ex_cols:
            conn.execute("ALTER TABLE gym_exercises ADD COLUMN is_favourite INTEGER DEFAULT 0")
        # Migration: add missing columns to gym_workouts (old schema had 'type' not 'workout_name')
        w_cols = _gym_table_columns(conn, "gym_workouts")
        if "workout_name" not in w_cols:
            conn.execute("ALTER TABLE gym_workouts ADD COLUMN workout_name TEXT")
            # Migrate from old 'type' column if it exists
            if "type" in w_cols:
                conn.execute("UPDATE gym_workouts SET workout_name = type WHERE workout_name IS NULL")
        if "program_type" not in w_cols:
            conn.execute("ALTER TABLE gym_workouts ADD COLUMN program_type TEXT")
        if "duration_minutes" not in w_cols:
            conn.execute("ALTER TABLE gym_workouts ADD COLUMN duration_minutes INTEGER")
        if "garmin_activity_id" not in w_cols:
            conn.execute("ALTER TABLE gym_workouts ADD COLUMN garmin_activity_id INTEGER")
        if "created_at" not in w_cols:
            conn.execute("ALTER TABLE gym_workouts ADD COLUMN created_at TIMESTAMP")
        if "calories" not in w_cols:
            conn.execute("ALTER TABLE gym_workouts ADD COLUMN calories INTEGER")
        if "avg_hr" not in w_cols:
            conn.execute("ALTER TABLE gym_workouts ADD COLUMN avg_hr INTEGER")
        # Migration: add missing columns to gym_exercises
        if "secondary_muscles" not in ex_cols:
            conn.execute("ALTER TABLE gym_exercises ADD COLUMN secondary_muscles TEXT")
        if "exercise_type" not in ex_cols:
            conn.execute("ALTER TABLE gym_exercises ADD COLUMN exercise_type TEXT DEFAULT 'compound'")
        if "force_type" not in ex_cols:
            conn.execute("ALTER TABLE gym_exercises ADD COLUMN force_type TEXT")
        if "level" not in ex_cols:
            conn.execute("ALTER TABLE gym_exercises ADD COLUMN level TEXT")
        if "is_custom" not in ex_cols:
            conn.execute("ALTER TABLE gym_exercises ADD COLUMN is_custom INTEGER DEFAULT 0")
        if "name_ua" not in ex_cols:
            conn.execute("ALTER TABLE gym_exercises ADD COLUMN name_ua TEXT")
