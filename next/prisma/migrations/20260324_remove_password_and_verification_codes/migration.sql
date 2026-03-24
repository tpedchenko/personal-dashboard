-- Remove credentials and magic link auth (keeping only OAuth, Passkeys, Demo)
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
DROP TABLE IF EXISTS "verification_codes";
