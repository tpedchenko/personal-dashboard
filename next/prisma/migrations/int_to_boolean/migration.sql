-- Migration: Convert Int columns that represent boolean values to Boolean type
-- Tables: custom_accounts, budgets, recurring_transactions, savings_goals,
--         food_log, gym_exercises, gym_sets

-- custom_accounts.is_active (default 1 -> true)
ALTER TABLE "custom_accounts" ALTER COLUMN "is_active" TYPE BOOLEAN USING (is_active = 1);
ALTER TABLE "custom_accounts" ALTER COLUMN "is_active" SET DEFAULT true;

-- budgets.active (default 1 -> true)
ALTER TABLE "budgets" ALTER COLUMN "active" TYPE BOOLEAN USING (active = 1);
ALTER TABLE "budgets" ALTER COLUMN "active" SET DEFAULT true;

-- recurring_transactions.active (default 1 -> true)
ALTER TABLE "recurring_transactions" ALTER COLUMN "active" TYPE BOOLEAN USING (active = 1);
ALTER TABLE "recurring_transactions" ALTER COLUMN "active" SET DEFAULT true;

-- savings_goals.active (default 1 -> true)
ALTER TABLE "savings_goals" ALTER COLUMN "active" TYPE BOOLEAN USING (active = 1);
ALTER TABLE "savings_goals" ALTER COLUMN "active" SET DEFAULT true;

-- food_log.confirmed (default 1 -> true)
ALTER TABLE "food_log" ALTER COLUMN "confirmed" TYPE BOOLEAN USING (confirmed = 1);
ALTER TABLE "food_log" ALTER COLUMN "confirmed" SET DEFAULT true;

-- gym_exercises.is_custom (default 0 -> false)
ALTER TABLE "gym_exercises" ALTER COLUMN "is_custom" TYPE BOOLEAN USING (is_custom = 1);
ALTER TABLE "gym_exercises" ALTER COLUMN "is_custom" SET DEFAULT false;

-- gym_exercises.is_favourite (default 0 -> false)
ALTER TABLE "gym_exercises" ALTER COLUMN "is_favourite" TYPE BOOLEAN USING (is_favourite = 1);
ALTER TABLE "gym_exercises" ALTER COLUMN "is_favourite" SET DEFAULT false;

-- gym_sets.is_warmup (default 0 -> false)
ALTER TABLE "gym_sets" ALTER COLUMN "is_warmup" TYPE BOOLEAN USING (is_warmup = 1);
ALTER TABLE "gym_sets" ALTER COLUMN "is_warmup" SET DEFAULT false;

-- gym_sets.is_failure (default 0 -> false)
ALTER TABLE "gym_sets" ALTER COLUMN "is_failure" TYPE BOOLEAN USING (is_failure = 1);
ALTER TABLE "gym_sets" ALTER COLUMN "is_failure" SET DEFAULT false;
