-- AlterTable: add userId to GarminHeartRate composite PK
-- Default existing rows to user 1 (single-user legacy data)

-- 1. Ensure userId column has a default for existing data
ALTER TABLE "garmin_heart_rate" ALTER COLUMN "user_id" SET DEFAULT 1;

-- 2. Backfill any NULL user_id values
UPDATE "garmin_heart_rate" SET "user_id" = 1 WHERE "user_id" IS NULL;

-- 3. Make user_id NOT NULL (if not already)
ALTER TABLE "garmin_heart_rate" ALTER COLUMN "user_id" SET NOT NULL;

-- 4. Drop old composite primary key
ALTER TABLE "garmin_heart_rate" DROP CONSTRAINT "garmin_heart_rate_pkey";

-- 5. Create new composite primary key including user_id
ALTER TABLE "garmin_heart_rate" ADD CONSTRAINT "garmin_heart_rate_pkey" PRIMARY KEY ("user_id", "date", "timestamp");

-- 6. Add index on user_id for query performance
CREATE INDEX "garmin_heart_rate_user_id_idx" ON "garmin_heart_rate"("user_id");

-- 7. Add foreign key constraint
ALTER TABLE "garmin_heart_rate" ADD CONSTRAINT "garmin_heart_rate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Remove the default (no longer needed after backfill)
ALTER TABLE "garmin_heart_rate" ALTER COLUMN "user_id" DROP DEFAULT;
