-- Migration: Nullable userId audit
-- Make user_id NOT NULL on all user-owned tables for proper multi-tenant isolation
-- Step 1: Delete orphaned rows where user_id IS NULL
-- Step 2: Add NOT NULL constraint

-- secrets
DELETE FROM secrets WHERE user_id IS NULL;
ALTER TABLE secrets ALTER COLUMN user_id SET NOT NULL;

-- transactions
DELETE FROM transactions WHERE user_id IS NULL;
ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;

-- custom_accounts
DELETE FROM custom_accounts WHERE user_id IS NULL;
ALTER TABLE custom_accounts ALTER COLUMN user_id SET NOT NULL;

-- category_favourites
DELETE FROM category_favourites WHERE user_id IS NULL;
ALTER TABLE category_favourites ALTER COLUMN user_id SET NOT NULL;

-- custom_categories
DELETE FROM custom_categories WHERE user_id IS NULL;
ALTER TABLE custom_categories ALTER COLUMN user_id SET NOT NULL;

-- budgets
DELETE FROM budgets WHERE user_id IS NULL;
ALTER TABLE budgets ALTER COLUMN user_id SET NOT NULL;

-- budget_config
DELETE FROM budget_config WHERE user_id IS NULL;
ALTER TABLE budget_config ALTER COLUMN user_id SET NOT NULL;

-- mandatory_categories
DELETE FROM mandatory_categories WHERE user_id IS NULL;
ALTER TABLE mandatory_categories ALTER COLUMN user_id SET NOT NULL;

-- recurring_transactions
DELETE FROM recurring_transactions WHERE user_id IS NULL;
ALTER TABLE recurring_transactions ALTER COLUMN user_id SET NOT NULL;

-- savings_goals
DELETE FROM savings_goals WHERE user_id IS NULL;
ALTER TABLE savings_goals ALTER COLUMN user_id SET NOT NULL;

-- daily_log
DELETE FROM daily_log WHERE user_id IS NULL;
ALTER TABLE daily_log ALTER COLUMN user_id SET NOT NULL;

-- food_log
DELETE FROM food_log WHERE user_id IS NULL;
ALTER TABLE food_log ALTER COLUMN user_id SET NOT NULL;

-- shopping_items
DELETE FROM shopping_items WHERE user_id IS NULL;
ALTER TABLE shopping_items ALTER COLUMN user_id SET NOT NULL;

-- shopping_history
DELETE FROM shopping_history WHERE user_id IS NULL;
ALTER TABLE shopping_history ALTER COLUMN user_id SET NOT NULL;

-- garmin_daily
DELETE FROM garmin_daily WHERE user_id IS NULL;
ALTER TABLE garmin_daily ALTER COLUMN user_id SET NOT NULL;

-- garmin_activities
DELETE FROM garmin_activities WHERE user_id IS NULL;
ALTER TABLE garmin_activities ALTER COLUMN user_id SET NOT NULL;

-- garmin_sleep
DELETE FROM garmin_sleep WHERE user_id IS NULL;
ALTER TABLE garmin_sleep ALTER COLUMN user_id SET NOT NULL;

-- garmin_heart_rate
DELETE FROM garmin_heart_rate WHERE user_id IS NULL;
ALTER TABLE garmin_heart_rate ALTER COLUMN user_id SET NOT NULL;

-- garmin_staging
DELETE FROM garmin_staging WHERE user_id IS NULL;
ALTER TABLE garmin_staging ALTER COLUMN user_id SET NOT NULL;

-- garmin_body_composition
DELETE FROM garmin_body_composition WHERE user_id IS NULL;
ALTER TABLE garmin_body_composition ALTER COLUMN user_id SET NOT NULL;

-- withings_measurements
DELETE FROM withings_measurements WHERE user_id IS NULL;
ALTER TABLE withings_measurements ALTER COLUMN user_id SET NOT NULL;

-- ai_notes
DELETE FROM ai_notes WHERE user_id IS NULL;
ALTER TABLE ai_notes ALTER COLUMN user_id SET NOT NULL;

-- ai_context_snapshots
DELETE FROM ai_context_snapshots WHERE user_id IS NULL;
ALTER TABLE ai_context_snapshots ALTER COLUMN user_id SET NOT NULL;

-- gym_exercises
DELETE FROM gym_exercises WHERE user_id IS NULL;
ALTER TABLE gym_exercises ALTER COLUMN user_id SET NOT NULL;

-- gym_workouts
DELETE FROM gym_workouts WHERE user_id IS NULL;
ALTER TABLE gym_workouts ALTER COLUMN user_id SET NOT NULL;

-- gym_workout_exercises
DELETE FROM gym_workout_exercises WHERE user_id IS NULL;
ALTER TABLE gym_workout_exercises ALTER COLUMN user_id SET NOT NULL;

-- gym_sets
DELETE FROM gym_sets WHERE user_id IS NULL;
ALTER TABLE gym_sets ALTER COLUMN user_id SET NOT NULL;

-- gym_programs
DELETE FROM gym_programs WHERE user_id IS NULL;
ALTER TABLE gym_programs ALTER COLUMN user_id SET NOT NULL;

-- gym_program_days
DELETE FROM gym_program_days WHERE user_id IS NULL;
ALTER TABLE gym_program_days ALTER COLUMN user_id SET NOT NULL;

-- gym_program_exercises
DELETE FROM gym_program_exercises WHERE user_id IS NULL;
ALTER TABLE gym_program_exercises ALTER COLUMN user_id SET NOT NULL;

-- sync_failures
DELETE FROM sync_failures WHERE user_id IS NULL;
ALTER TABLE sync_failures ALTER COLUMN user_id SET NOT NULL;
