-- Add missing indexes for gym tables

-- GymWorkout: queries filter by userId + date
CREATE INDEX IF NOT EXISTS idx_gym_workouts_user_date ON gym_workouts (user_id, date);

-- GymWorkoutExercise: used in joins by workoutId
CREATE INDEX IF NOT EXISTS idx_gym_workout_exercises_workout ON gym_workout_exercises (workout_id);

-- GymWorkoutExercise: used in getLastSetsForExercise
CREATE INDEX IF NOT EXISTS idx_gym_workout_exercises_user_exercise ON gym_workout_exercises (user_id, exercise_id);

-- GymSet: used in joins by workoutExerciseId
CREATE INDEX IF NOT EXISTS idx_gym_sets_workout_exercise ON gym_sets (workout_exercise_id);
