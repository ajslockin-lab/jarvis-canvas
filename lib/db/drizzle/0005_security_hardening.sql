-- 0005_security_hardening.sql
-- Idempotent. Run after drizzle-kit push so raw SQL features (extensions,
-- triggers, custom roles) come together without modifying schema TS files.
--
-- Run via scripts/apply-security-hardening.mjs -- applied by dev.mjs's
-- "Pushing database schema..." step so fresh checkouts get hardened
-- automatically. See README "DB security" for the policy this enables.

-- --- Extensions -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;         -- digest(), gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS citext;           -- case-insensitive email

-- --- Non-superuser app role -------------------------------------------------
-- The api-server connects as `carvis_app` instead of `postgres` once this
-- migration has run. The role survives a cluster reset because we create it
-- only if it doesn't exist -- the connection pool re-uses it across dev.mjs
-- restarts. statement_timeout caps runaway queries; idle_in_transaction
-- prevents forgotten BEGIN blocks from holding row locks.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carvis_app') THEN
    CREATE ROLE carvis_app LOGIN PASSWORD 'carvis_app';
  END IF;
END
$$;

-- Force-idempotent role attributes so the role stays login-able across cluster
-- resets (e.g. embedded-postgres recovering from a crash). The CREATE block
-- above only runs the password set on a virgin cluster; rerunning without
-- this would leave the role with whatever auth state survived recovery.
ALTER ROLE carvis_app LOGIN PASSWORD 'carvis_app';

ALTER ROLE carvis_app SET statement_timeout = '10s';
ALTER ROLE carvis_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE carvis_app SET application_name = 'carvis_api';

-- Grant table/sequence access. Adjust to schema additions in future migrations.
GRANT USAGE ON SCHEMA public TO carvis_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carvis_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO carvis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO carvis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO carvis_app;

-- --- In-database audit log --------------------------------------------------
-- Append-only. Captures who/what/when on rows that matter for security
-- investigations: user creation, session creation, password resets, etc.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id TEXT,
  source_ip INET,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  changed_fields JSONB
);

REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON audit_log FROM carvis_app;
GRANT  SELECT, INSERT ON audit_log TO carvis_app;

-- Trigger helper. Reads the per-transaction setting `app.current_user_id`
-- set by the api middleware. Falls back to NULL when the write is from a
-- background job (sync-scheduler, reminder-scheduler).
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS TRIGGER AS $$
DECLARE
  v_actor   TEXT := current_setting('app.current_user_id', true);
  v_ip      INET := NULLIF(current_setting('app.requester_ip', true), '')::INET;
  v_pk      TEXT;
  v_changed JSONB := NULL;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_pk := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_pk := NEW.id;
    SELECT jsonb_object_agg(
             n.key,
             jsonb_build_object('old', o.value, 'new', n.value)
           )
      INTO v_changed
      FROM jsonb_each(to_jsonb(OLD)) AS o
      JOIN jsonb_each(to_jsonb(NEW)) AS n ON n.key = o.key
     WHERE o.value::text IS DISTINCT FROM n.value::text
       AND n.key NOT IN ('updated_at', 'last_sync_at', 'last_seen_at');
  ELSE
    v_pk := OLD.id;
  END IF;

  INSERT INTO audit_log (actor_user_id, source_ip, operation, table_name, row_id, changed_fields)
  VALUES (v_actor, v_ip, TG_OP, TG_TABLE_NAME, COALESCE(v_pk, ''), v_changed);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

-- Attach the audit trigger to the security-sensitive tables. Drop+create so
-- this migration is idempotent against repeat runs.
DROP TRIGGER IF EXISTS users_audit ON users;
CREATE TRIGGER users_audit AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS sessions_audit ON sessions;
CREATE TRIGGER sessions_audit AFTER INSERT OR DELETE ON sessions
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS reminders_audit ON reminders;
CREATE TRIGGER reminders_audit AFTER INSERT OR UPDATE OR DELETE ON reminders
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

DROP TRIGGER IF EXISTS conversations_audit ON conversations;
CREATE TRIGGER conversations_audit AFTER INSERT OR DELETE ON conversations
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- --- Check constraints ------------------------------------------------------
-- Hard data-shape rules -- defense in depth against any path (api route,
-- migration, manual psql) that bypasses the zod layer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'users_email_format_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_email_format_chk
      CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'users_password_hash_when_password_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_password_hash_when_password_chk
      CHECK (
        password_hash IS NULL
        OR password_hash LIKE '$2b$%'  -- bcrypt hashes
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sessions' AND constraint_name = 'sessions_id_prefix_chk'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_id_prefix_chk
      CHECK (id LIKE 'sess_%');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sessions' AND constraint_name = 'sessions_expires_future_chk'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_expires_future_chk
      CHECK (expires_at > created_at);
  END IF;
END
$$;

-- --- Soft-touch: prepare for Phase B RLS ------------------------------------
-- Policies are written but FORCE RLS is left OFF. Phase B will flip one
-- row in this paragraph when each api route is refactored to set
-- `app.current_user_id` per request. Until then the policies are inert
-- (benign -- they only fire once RLS is enabled).
--
-- DO NOT enable FORCE ROW LEVEL SECURITY until Phase B. Doing so locks out
-- every existing route that hasn't been updated.

-- (intentionally no FORCE ROW LEVEL SECURITY here on purpose)
