-- Adds password-based auth support to users table.
-- The signup flow (email + password -> verification code) lives on top of these columns.
--
-- Constraints:
--   - password_hash is nullable: existing Canvas-only users don't have passwords.
--   - email_verified_at is nullable: only set when the verification code is consumed.
--   - auth_provider defaults to 'canvas' so every existing row stays valid.
--
-- The LOWER(email) unique index lets users sign in with any case mix
-- (Foo@x.com and foo@x.com resolve to the same account) while keeping the
-- original email stored verbatim for display. This is the standard email-
-- normalization pattern recommended by OWASP.

ALTER TABLE "users" ADD COLUMN "password_hash" text;
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp;
ALTER TABLE "users" ADD COLUMN "auth_provider" text NOT NULL DEFAULT 'canvas';

-- Drop the old case-sensitive unique constraint first so we can replace it.
-- Drizzle's `email: text().notNull().unique()` produces a UNIQUE CONSTRAINT
-- in Postgres, not just an index. The constraint carries the auto-generated
-- index that backs it.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_unique";
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" (LOWER("email"));

CREATE TABLE "email_verifications" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "consumed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "email_verifications_user_idx" ON "email_verifications" ("user_id");
-- Index on consumed_at IS NULL partial -- the hot path is "find latest unconsumed row".
-- Postgres won't use the index for the consumed case but that's fine (those are rare).
CREATE INDEX "email_verifications_pending_idx"
  ON "email_verifications" ("user_id", "created_at" DESC)
  WHERE "consumed_at" IS NULL;
