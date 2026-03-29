-- CreateTable
CREATE TABLE "big_purchases" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "estimated_price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "url" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'investigating',
    "investigate_notes" TEXT,
    "cooling_started_at" TIMESTAMP(3),
    "cooling_days" INTEGER NOT NULL DEFAULT 7,
    "confirmed_at" TIMESTAMP(3),
    "purchased_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "big_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_big_purchases_user_status" ON "big_purchases"("user_id", "status");
