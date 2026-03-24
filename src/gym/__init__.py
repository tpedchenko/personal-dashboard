"""Gym workout tracking module.

Provides exercise library, workout logging with sets/reps/weight,
PPL program templates, and progress statistics.

This package re-exports all public functions for backwards compatibility.
All imports like `from src.gym import X` continue to work.
"""

# ─── Schema & init ───────────────────────────────────────────────────────────
from .schema import (
    CREATE_GYM_EXERCISES_SQL,
    CREATE_GYM_WORKOUTS_SQL,
    CREATE_GYM_WORKOUT_EXERCISES_SQL,
    CREATE_GYM_SETS_SQL,
    CREATE_GYM_PROGRAMS_SQL,
    CREATE_GYM_PROGRAM_DAYS_SQL,
    CREATE_GYM_PROGRAM_EXERCISES_SQL,
    _GYM_TABLES,
    _gym_table_columns,
    init_gym_db,
)

# ─── Exercises ───────────────────────────────────────────────────────────────
from .exercises import (
    _DEFAULT_EXERCISES,
    _MUSCLE_GROUP_ICONS,
    get_muscle_group_icon,
    get_exercise_display_name,
    get_exercise_display_with_icon,
    seed_exercises,
    add_custom_exercise,
    delete_custom_exercise,
    get_custom_exercises,
    get_exercises,
    get_exercises_by_frequency,
    get_frequent_exercises,
    get_exercise_history,
    get_previous_exercise_sets,
    add_exercises_from_history,
    toggle_exercise_favourite,
    auto_favourite_exercises,
    standardize_exercises,
    import_gymup_data,
    _EXERCISE_RENAME_MAP,
    _EXERCISE_MUSCLE_FIX,
    _EXERCISE_EQUIPMENT_FIX,
    _guess_muscle_group,
    _guess_equipment,
)

# ─── Workouts ────────────────────────────────────────────────────────────────
from .workouts import (
    get_workouts,
    get_workout_detail,
    create_workout,
    add_exercise_to_workout,
    add_set,
    update_set,
    delete_set,
    delete_workout,
    remove_exercise_from_workout,
    cleanup_empty_exercises,
    finish_workout,
    get_workout_calendar,
    start_workout_by_type,
    normalize_workout_names,
    classify_workouts,
    _WORKOUT_PRESETS,
)

# ─── Programs ────────────────────────────────────────────────────────────────
from .programs import (
    get_programs,
    get_program_detail,
    start_workout_from_program,
    create_program,
    update_program,
    delete_program,
    add_program_day,
    update_program_day,
    delete_program_day,
    add_exercise_to_program_day,
    remove_exercise_from_program_day,
    reorder_program_exercises,
    update_program_exercise,
    seed_ppl_program,
)

# ─── Analytics ───────────────────────────────────────────────────────────────
from .analytics import (
    get_muscle_last_trained,
    get_muscle_recovery_status,
    get_exercise_prs,
    get_weekly_muscle_volume,
    get_workout_stats,
    get_workout_recommendations,
    merge_garmin_with_workouts,
    link_garmin_activity_to_workout,
    match_garmin_workouts,
    get_garmin_match_stats,
    get_workout_garmin_data,
    _MUSCLE_GROUPS,
    _GOAL_CONFIG,
)
