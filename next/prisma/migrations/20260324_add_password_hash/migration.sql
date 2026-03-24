-- Add password_hash column to users table for credentials authentication
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
