-- Transaction indexes with userId for multi-tenant query performance
CREATE INDEX IF NOT EXISTS "idx_transactions_user_date" ON "transactions"("user_id", "date");
CREATE INDEX IF NOT EXISTS "idx_transactions_user_type_date" ON "transactions"("user_id", "type", "date");

-- AuditLog index for filtering by action + time range
CREATE INDEX IF NOT EXISTS "idx_audit_log_action_created" ON "audit_log"("action", "created_at");

-- ShoppingHistory index for userId lookups
CREATE INDEX IF NOT EXISTS "idx_shopping_history_user" ON "shopping_history"("user_id");
