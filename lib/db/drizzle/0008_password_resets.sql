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

-- Audit-trigger attachment for password_resets happens inside
-- scripts/bootstrap-neon.ps1 *after* 0005 defines audit_row_change(); CREATE
-- TRIGGER needs the function to exist.
