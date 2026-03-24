-- Migration: Convert timestamp columns from TEXT to TIMESTAMPTZ
-- All these columns stored ISO8601 strings like '2025-01-15T10:30:00.000Z'
-- Converting to proper TIMESTAMPTZ for correct range queries and timezone support.

-- =========================================================================
-- Auth & Users
-- =========================================================================

-- users.created_at
ALTER TABLE users
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- guest_invites.created_at
ALTER TABLE guest_invites
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- audit_log.created_at
ALTER TABLE audit_log
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- telegram_connect_codes.created_at
ALTER TABLE telegram_connect_codes
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- =========================================================================
-- Finance
-- =========================================================================

-- transactions.created_at
ALTER TABLE transactions
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- budgets.created_at
ALTER TABLE budgets
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- budget_config.created_at
ALTER TABLE budget_config
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- mandatory_categories.created_at
ALTER TABLE mandatory_categories
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- recurring_transactions.created_at
ALTER TABLE recurring_transactions
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- savings_goals.created_at
ALTER TABLE savings_goals
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- =========================================================================
-- Daily Log & Lifestyle
-- =========================================================================

-- daily_log.created_at
ALTER TABLE daily_log
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- =========================================================================
-- Food
-- =========================================================================

-- food_log.created_at
ALTER TABLE food_log
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- =========================================================================
-- Shopping
-- =========================================================================

-- shopping_items.added_at
ALTER TABLE shopping_items
  ALTER COLUMN added_at TYPE TIMESTAMPTZ USING added_at::TIMESTAMPTZ,
  ALTER COLUMN added_at SET DEFAULT NOW();

-- shopping_items.bought_at
ALTER TABLE shopping_items
  ALTER COLUMN bought_at TYPE TIMESTAMPTZ USING bought_at::TIMESTAMPTZ;

-- =========================================================================
-- Garmin
-- =========================================================================

-- garmin_daily.synced_at
ALTER TABLE garmin_daily
  ALTER COLUMN synced_at TYPE TIMESTAMPTZ USING synced_at::TIMESTAMPTZ,
  ALTER COLUMN synced_at SET DEFAULT NOW();

-- garmin_activities.synced_at
ALTER TABLE garmin_activities
  ALTER COLUMN synced_at TYPE TIMESTAMPTZ USING synced_at::TIMESTAMPTZ,
  ALTER COLUMN synced_at SET DEFAULT NOW();

-- garmin_sleep.synced_at
ALTER TABLE garmin_sleep
  ALTER COLUMN synced_at TYPE TIMESTAMPTZ USING synced_at::TIMESTAMPTZ,
  ALTER COLUMN synced_at SET DEFAULT NOW();

-- garmin_staging.fetched_at
ALTER TABLE garmin_staging
  ALTER COLUMN fetched_at TYPE TIMESTAMPTZ USING fetched_at::TIMESTAMPTZ,
  ALTER COLUMN fetched_at SET DEFAULT NOW();

-- garmin_body_composition.synced_at
ALTER TABLE garmin_body_composition
  ALTER COLUMN synced_at TYPE TIMESTAMPTZ USING synced_at::TIMESTAMPTZ,
  ALTER COLUMN synced_at SET DEFAULT NOW();

-- =========================================================================
-- Withings
-- =========================================================================

-- withings_measurements.synced_at
ALTER TABLE withings_measurements
  ALTER COLUMN synced_at TYPE TIMESTAMPTZ USING synced_at::TIMESTAMPTZ,
  ALTER COLUMN synced_at SET DEFAULT NOW();

-- =========================================================================
-- AI
-- =========================================================================

-- ai_notes.generated_at
ALTER TABLE ai_notes
  ALTER COLUMN generated_at TYPE TIMESTAMPTZ USING generated_at::TIMESTAMPTZ,
  ALTER COLUMN generated_at SET DEFAULT NOW();

-- chat_history.created_at
ALTER TABLE chat_history
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- =========================================================================
-- Gym
-- =========================================================================

-- gym_exercises.created_at
ALTER TABLE gym_exercises
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- gym_workouts.created_at
ALTER TABLE gym_workouts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();

-- gym_programs.created_at
ALTER TABLE gym_programs
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
  ALTER COLUMN created_at SET DEFAULT NOW();
