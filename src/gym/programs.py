"""Program CRUD: create, days, exercises, PPL seed, start workout from program."""
from datetime import date

import pandas as pd

from src.database import get_conn, read_sql
from .workouts import create_workout, add_exercise_to_workout


def get_programs() -> pd.DataFrame:
    with get_conn() as conn:
        return read_sql("SELECT * FROM gym_programs ORDER BY name", conn)


def get_program_detail(program_id: int) -> dict:
    """Get program with days and exercises."""
    with get_conn() as conn:
        cur = conn.execute("SELECT * FROM gym_programs WHERE id = ?", (program_id,))
        prog = cur.fetchone()
        if not prog:
            return {}

        p_cols = [d[0] for d in cur.description]
        result = dict(zip(p_cols, prog))
        result["days"] = []

        days = conn.execute("""
            SELECT id, day_num, day_name, focus FROM gym_program_days
            WHERE program_id = ? ORDER BY day_num
        """, (program_id,)).fetchall()

        for d_id, d_num, d_name, focus in days:
            exercises = conn.execute("""
                SELECT pe.id, pe.order_num, pe.target_sets, pe.target_reps, pe.superset_group,
                       e.id, e.name, e.muscle_group, e.equipment
                FROM gym_program_exercises pe
                JOIN gym_exercises e ON e.id = pe.exercise_id
                WHERE pe.program_day_id = ?
                ORDER BY pe.order_num
            """, (d_id,)).fetchall()

            result["days"].append({
                "day_id": d_id, "day_num": d_num, "day_name": d_name, "focus": focus,
                "exercises": [{"pe_id": e[0], "order": e[1], "target_sets": e[2], "target_reps": e[3],
                               "superset_group": e[4], "exercise_id": e[5], "name": e[6],
                               "muscle_group": e[7], "equipment": e[8]} for e in exercises],
            })

    return result


def start_workout_from_program(program_id: int, day_num: int) -> int:
    """Create a workout from a program template."""
    detail = get_program_detail(program_id)
    if not detail:
        return 0

    day = next((d for d in detail["days"] if d["day_num"] == day_num), None)
    if not day:
        return 0

    w_id = create_workout(
        workout_date=date.today().isoformat(),
        program_type=detail.get("program_type"),
        workout_name=f"{detail['name']} — {day['day_name']}",
    )

    for ex in day["exercises"]:
        add_exercise_to_workout(w_id, ex["exercise_id"], ex["order"])

    return w_id


def create_program(name: str, description: str = "", program_type: str = "",
                   days_per_week: int = 3) -> int | None:
    """Create a new program. Returns program ID or None if name exists."""
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM gym_programs WHERE name = ?", (name,)
        ).fetchone()
        if existing:
            return None
        conn.execute("""
            INSERT INTO gym_programs (name, description, program_type, days_per_week)
            VALUES (?, ?, ?, ?)
        """, (name, description, program_type, days_per_week))
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def update_program(program_id: int, name: str, description: str = "",
                   program_type: str = "", days_per_week: int = 3):
    """Update program metadata."""
    with get_conn() as conn:
        conn.execute("""
            UPDATE gym_programs SET name = ?, description = ?, program_type = ?, days_per_week = ?
            WHERE id = ?
        """, (name, description, program_type, days_per_week, program_id))


def delete_program(program_id: int):
    """Delete a program and all its days/exercises."""
    with get_conn() as conn:
        day_ids = [r[0] for r in conn.execute(
            "SELECT id FROM gym_program_days WHERE program_id = ?", (program_id,)
        ).fetchall()]
        for d_id in day_ids:
            conn.execute("DELETE FROM gym_program_exercises WHERE program_day_id = ?", (d_id,))
        conn.execute("DELETE FROM gym_program_days WHERE program_id = ?", (program_id,))
        conn.execute("DELETE FROM gym_programs WHERE id = ?", (program_id,))


def add_program_day(program_id: int, day_name: str, focus: str = "") -> int:
    """Add a day to a program. Returns day ID."""
    with get_conn() as conn:
        max_num = conn.execute(
            "SELECT COALESCE(MAX(day_num), 0) FROM gym_program_days WHERE program_id = ?",
            (program_id,)
        ).fetchone()[0]
        conn.execute("""
            INSERT INTO gym_program_days (program_id, day_num, day_name, focus)
            VALUES (?, ?, ?, ?)
        """, (program_id, max_num + 1, day_name, focus))
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def update_program_day(day_id: int, day_name: str, focus: str = ""):
    """Update a program day."""
    with get_conn() as conn:
        conn.execute(
            "UPDATE gym_program_days SET day_name = ?, focus = ? WHERE id = ?",
            (day_name, focus, day_id)
        )


def delete_program_day(day_id: int):
    """Delete a program day and its exercises."""
    with get_conn() as conn:
        conn.execute("DELETE FROM gym_program_exercises WHERE program_day_id = ?", (day_id,))
        conn.execute("DELETE FROM gym_program_days WHERE id = ?", (day_id,))


def add_exercise_to_program_day(program_day_id: int, exercise_id: int,
                                target_sets: int = 3, target_reps: str = "8-12") -> int:
    """Add exercise to a program day. Returns program_exercise ID."""
    with get_conn() as conn:
        max_order = conn.execute(
            "SELECT COALESCE(MAX(order_num), 0) FROM gym_program_exercises WHERE program_day_id = ?",
            (program_day_id,)
        ).fetchone()[0]
        conn.execute("""
            INSERT INTO gym_program_exercises (program_day_id, exercise_id, order_num, target_sets, target_reps)
            VALUES (?, ?, ?, ?, ?)
        """, (program_day_id, exercise_id, max_order + 1, target_sets, target_reps))
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def remove_exercise_from_program_day(program_exercise_id: int):
    """Remove exercise from a program day."""
    with get_conn() as conn:
        conn.execute("DELETE FROM gym_program_exercises WHERE id = ?", (program_exercise_id,))


def reorder_program_exercises(program_day_id: int, exercise_ids_ordered: list[int]):
    """Reorder exercises in a program day by list of program_exercise IDs."""
    with get_conn() as conn:
        for order, pe_id in enumerate(exercise_ids_ordered, 1):
            conn.execute(
                "UPDATE gym_program_exercises SET order_num = ? WHERE id = ? AND program_day_id = ?",
                (order, pe_id, program_day_id)
            )


def update_program_exercise(pe_id: int, target_sets: int, target_reps: str):
    """Update sets and reps for a program exercise."""
    with get_conn() as conn:
        conn.execute(
            "UPDATE gym_program_exercises SET target_sets = ?, target_reps = ? WHERE id = ?",
            (target_sets, target_reps, pe_id)
        )


def seed_ppl_program():
    """Create default Push/Pull/Legs program if none exists."""
    with get_conn() as conn:
        exists = conn.execute("SELECT COUNT(*) FROM gym_programs WHERE name='Push Pull Legs'").fetchone()[0]
        if exists:
            return

        conn.execute("""
            INSERT INTO gym_programs (name, description, program_type, days_per_week)
            VALUES ('Push Pull Legs', 'Classic PPL split for hypertrophy and strength', 'PPL', 3)
        """)
        prog_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        ppl_days = [
            (1, "Push", "chest,shoulders,triceps", [
                "Barbell Bench Press", "Incline Dumbbell Press", "Overhead Press",
                "Lateral Raises", "Tricep Pushdown", "Overhead Tricep Extension",
            ]),
            (2, "Pull", "back,biceps", [
                "Barbell Row", "Lat Pulldown", "Seated Cable Row",
                "Face Pulls", "Barbell Curl", "Hammer Curl",
            ]),
            (3, "Legs", "quads,hamstrings,glutes,calves", [
                "Barbell Squat", "Romanian Deadlift", "Leg Press",
                "Leg Curl", "Leg Extension", "Calf Raises",
            ]),
        ]

        for day_num, day_name, focus, exercises in ppl_days:
            conn.execute("""
                INSERT INTO gym_program_days (program_id, day_num, day_name, focus)
                VALUES (?, ?, ?, ?)
            """, (prog_id, day_num, day_name, focus))
            day_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

            for order, ex_name in enumerate(exercises, 1):
                ex_id = conn.execute(
                    "SELECT id FROM gym_exercises WHERE name = ?", (ex_name,)
                ).fetchone()
                if ex_id:
                    conn.execute("""
                        INSERT INTO gym_program_exercises
                        (program_day_id, exercise_id, order_num, target_sets, target_reps)
                        VALUES (?, ?, ?, 3, '8-12')
                    """, (day_id, ex_id[0], order))
