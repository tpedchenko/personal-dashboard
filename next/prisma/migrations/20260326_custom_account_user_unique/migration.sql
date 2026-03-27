-- DropIndex
DROP INDEX IF EXISTS "custom_accounts_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "custom_accounts_user_id_name_key" ON "custom_accounts"("user_id", "name");
