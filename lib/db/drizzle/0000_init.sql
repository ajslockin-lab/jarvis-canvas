-- CARVIS initial schema — all CREATE TABLE statements.
-- Run this first on a fresh Postgres, then apply 0001–0004 incrementally.
-- Matches lib/db/src/schema/jarvis.ts.

CREATE TABLE "users" (
  "id" text PRIMARY KEY,
  "email" text NOT NULL,
  "name" text,
  "password_hash" text,
  "email_verified_at" timestamp,
  "auth_provider" text NOT NULL DEFAULT 'canvas',
  "canvas_base_url" text,
  "canvas_access_token_encrypted" text,
  "canvas_refresh_token_encrypted" text,
  "canvas_token_expires_at" timestamp,
  "canvas_user_id" text,
  "referred_from" text,
  "last_sync_phase" text,
  "last_sync_at" timestamp,
  "last_sync_error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Case-insensitive email uniqueness. This is the canonical index; the
-- original users_email_unique constraint is dropped in migration 0004
-- and replaced with this partial unique index.
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

CREATE TABLE "courses" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "code" text,
  "color" text,
  "last_synced" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "assignments" (
  "id" text PRIMARY KEY,
  "course_id" text NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "due_date" timestamp,
  "points" real,
  "url" text,
  "completed" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "grades" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "course_id" text NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "current_score" real,
  "final_score" real,
  "letter_grade" text,
  "fetched_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "reminders" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "assignment_id" text REFERENCES "assignments"("id") ON DELETE SET NULL,
  "type" text NOT NULL DEFAULT 'custom',
  "triggered_at" timestamp NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "conversations" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "message" text NOT NULL,
  "intent" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "sessions" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "activation_events" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "occurred_at" timestamp NOT NULL DEFAULT now()
);

-- Hot-path indexes
CREATE INDEX "email_verifications_user_idx" ON "email_verifications" ("user_id");
CREATE INDEX "email_verifications_pending_idx"
  ON "email_verifications" ("user_id", "created_at" DESC)
  WHERE "consumed_at" IS NULL;
