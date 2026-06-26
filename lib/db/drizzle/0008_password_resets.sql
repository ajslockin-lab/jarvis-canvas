-- 0008_password_resets.sql
-- Bridges the gap between the Drizzle TS schema (password_resetsTable, defined
-- in lib/db/src/schema/jarvis.ts) and the raw-SQL bootstrap path. Until now
-- 0000_init.sql never created the table, but 0005_security_hardening.sql tries
-- to attach `password_resets_audit` to it — which means fresh-DB bootstrap
-- blew up at the trigger step.
--
-- Drizzle ORM-only DBs already have the table (via drizzle-kit push). This
-- file is idempotent so it no-ops on those, and on raw-SQL fresh DBs it adds
-- the table + index 0005 was assuming existed.

CREATE TABLE IF NOT EXISTS "password_resets" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "consumed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Same access pattern as email_verifications: the hot path is "find latest
-- unconsumed row for this user".
CREATE INDEX IF NOT EXISTS "password_resets_user_idx"
  ON "password_resets" ("user_id");

CREATE INDEX IF NOT EXISTS "password_resets_pending_idx"
  ON "password_resets" ("user_id", "created_at" DESC)
  WHERE "consumed_at" IS NULL;

-- Attach the audit trigger to the table we just created. Doing this here
-- (rather than in 0005) avoids the half-applied migration: 0005 ran on
-- fresh DBs only if 0008 ran first to make the table.
DROP TRIGGER IF EXISTS password_resets_audit ON password_resets;
CREATE TRIGGER password_resets_audit AFTER INSERT OR UPDATE ON password_resets
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
