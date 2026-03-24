-- Migration: Convert date columns from VARCHAR/TEXT to DATE type
-- Affects 10K+ transactions — run during maintenance window
-- All values must be valid YYYY-MM-DD format before running

-- Step 1: Validate all date strings are valid YYYY-MM-DD (will fail if any are invalid)
DO $$
BEGIN
  -- Transactions
  PERFORM date::date FROM transactions LIMIT 0;
  -- Daily Log
  PERFORM date::date FROM daily_log LIMIT 0;
  -- Food Log
  PERFORM date::date FROM food_log LIMIT 0;
  -- Garmin Daily
  PERFORM date::date FROM garmin_daily LIMIT 0;
  -- Garmin Activities
  PERFORM date::date FROM garmin_activities LIMIT 0;
  -- Garmin Sleep
  PERFORM date::date FROM garmin_sleep LIMIT 0;
  -- Garmin Heart Rate
  PERFORM date::date FROM garmin_heart_rate LIMIT 0;
  -- Garmin Staging (nullable)
  PERFORM date::date FROM garmin_staging WHERE date IS NOT NULL LIMIT 0;
  -- Garmin Body Composition
  PERFORM date::date FROM garmin_body_composition LIMIT 0;
  -- Withings Measurements
  PERFORM date::date FROM withings_measurements LIMIT 0;
  -- Gym Workouts
  PERFORM date::date FROM gym_workouts LIMIT 0;
  -- Portfolio Snapshots
  PERFORM date::date FROM portfolio_snapshots LIMIT 0;
  -- NBU Rates
  PERFORM date::date FROM nbu_rates LIMIT 0;
  -- Shopping History
  PERFORM bought_date::date FROM shopping_history LIMIT 0;
END $$;

-- Step 2: Convert columns

ALTER TABLE transactions ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE daily_log ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE food_log ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE garmin_daily ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE garmin_activities ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE garmin_sleep ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE garmin_heart_rate ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE garmin_staging ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE garmin_body_composition ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE withings_measurements ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE gym_workouts ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE portfolio_snapshots ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE nbu_rates ALTER COLUMN date TYPE DATE USING date::date;

ALTER TABLE shopping_history ALTER COLUMN bought_date TYPE DATE USING bought_date::date;
