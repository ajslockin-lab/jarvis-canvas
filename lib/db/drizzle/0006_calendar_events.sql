-- 0006_calendar_events.sql
-- Idempotent. The calendar_events table itself is created here (the previous
-- files 0000-0005 were hand-rolled in this project, so drizzle-kit can't
-- auto-migrate the schema bump; the dev.mjs push phase handles ALL future
-- schema changes. For Tier 0 of Phase 2, raw-SQL through this file is the
-- simpler path. Re-run-safe via `IF NOT EXISTS` everywhere.)
--
-- What 0006 adds on top of the existing schema:
--   • calendar_events table (per-user cache of Canvas's iCal feed)
--   • composite unique index on (user_id, source_id) for diffing across syncs
--   • non-unique index on (user_id, start_at) for /api/calendar/events range queries
--
-- The FK to users(id) ON DELETE CASCADE matches the project convention so
-- account deletion wipes calendar data automatically. 0005's
-- `ALTER DEFAULT PRIVILEGES` already extends SELECT/INSERT/UPDATE/DELETE
-- to carvis_app on any future table in the public schema, so no GRANT
-- statements live here.

CREATE TABLE IF NOT EXISTS calendar_events (
  id            text        PRIMARY KEY,
  user_id       text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id     text        NOT NULL,
  summary       text,
  description   text,
  location      text,
  start_at      timestamp   NOT NULL,
  end_at        timestamp,
  last_synced_at timestamp  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_user_source_uniq
  ON calendar_events (user_id, source_id);

CREATE INDEX IF NOT EXISTS calendar_events_user_start_idx
  ON calendar_events (user_id, start_at);
