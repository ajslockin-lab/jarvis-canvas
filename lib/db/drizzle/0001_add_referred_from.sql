-- Adds a nullable text column to capture "how did you hear about us" once per user.
-- Nullable so existing rows are unaffected. No backfill needed.
-- Matches the schema change in lib/db/src/schema/jarvis.ts.

ALTER TABLE "users" ADD COLUMN "referred_from" text;
