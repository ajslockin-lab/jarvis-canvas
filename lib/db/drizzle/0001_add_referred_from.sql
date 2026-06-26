-- Adds a nullable text column to capture "how did you hear about us" once per user.
-- Nullable so existing rows are unaffected. No backfill needed.
-- Matches the schema change in lib/db/src/schema/jarvis.ts.

-- 0000_init already creates users.referred_from, so on a fresh DB this
-- is a no-op. ADD COLUMN IF NOT EXISTS keeps it idempotent for old DBs
-- (pre-init) that may not have the column yet.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referred_from" text;
