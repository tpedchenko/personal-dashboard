-- Migration: UserPreference — switch from user_email to user_id
-- This migration:
--   1. Populates user_id from users table (for any rows that have user_email but no user_id)
--   2. Drops the old composite primary key (user_email, key)
--   3. Creates a new composite primary key (user_id, key)
--   4. Drops the user_email column

-- Step 1: Ensure user_id column exists (it may already exist from raw INSERT statements)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN user_id INTEGER;
  END IF;
END $$;

-- Step 2: Populate user_id from users table where it's NULL
UPDATE user_preferences
SET user_id = u.id
FROM users u
WHERE user_preferences.user_email = u.email
  AND user_preferences.user_id IS NULL;

-- Step 3: Delete orphaned rows (no matching user)
DELETE FROM user_preferences WHERE user_id IS NULL;

-- Step 4: Make user_id NOT NULL
ALTER TABLE user_preferences ALTER COLUMN user_id SET NOT NULL;

-- Step 5: Drop old primary key (user_email, key)
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_pkey;

-- Step 6: Create new primary key (user_id, key)
ALTER TABLE user_preferences ADD PRIMARY KEY (user_id, key);

-- Step 7: Drop the user_email column
ALTER TABLE user_preferences DROP COLUMN IF EXISTS user_email;

-- Step 8: Add foreign key to users table
ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id)
  ON DELETE CASCADE;
