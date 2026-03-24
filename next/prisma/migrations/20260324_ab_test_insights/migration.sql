-- Add variant column to ai_insights for A/B testing
ALTER TABLE "ai_insights" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'default';

-- Drop old unique constraint and create new one with variant
DROP INDEX IF EXISTS "ai_insights_user_id_page_period_key";
CREATE UNIQUE INDEX "ai_insights_user_id_page_period_variant_key" ON "ai_insights"("user_id", "page", "period", "variant");

-- Add variant column to insight_feedback
ALTER TABLE "insight_feedback" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'default';

-- Add index for A/B test queries
CREATE INDEX "insight_feedback_user_id_page_variant_idx" ON "insight_feedback"("user_id", "page", "variant");
