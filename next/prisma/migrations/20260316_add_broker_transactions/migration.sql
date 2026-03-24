-- CreateTable
CREATE TABLE "broker_transactions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "broker" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "conid" TEXT,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "price" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL,
    "commission" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "executed_at" TIMESTAMP(3) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broker_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "broker_transactions_user_id_broker_symbol_type_executed_at_key" ON "broker_transactions"("user_id", "broker", "symbol", "type", "executed_at");
CREATE INDEX "broker_transactions_user_id_broker_idx" ON "broker_transactions"("user_id", "broker");
CREATE INDEX "broker_transactions_user_id_executed_at_idx" ON "broker_transactions"("user_id", "executed_at");
