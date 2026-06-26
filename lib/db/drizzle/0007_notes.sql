-- 0007_notes.sql
-- Idempotent. Notes table is the Phase 4 storage backing (see
-- routes/notes.ts). Flat per-user list; no tags/Recurrence — the LLM
-- already handles formatting in chat, and per-note metadata is the kind
-- of cruft that quietly rots. CASCADE FK keeps account delete wiping
-- notes automatically. 0005's `ALTER DEFAULT PRIVILEGES` extends
-- SELECT/INSERT/UPDATE/DELETE to carvis_app on any future table in the
-- public schema, so no GRANT statements live here.

CREATE TABLE IF NOT EXISTS notes (
  id          text        PRIMARY KEY,
  user_id     text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        text        NOT NULL,
  created_at  timestamp   NOT NULL DEFAULT now(),
  updated_at  timestamp   NOT NULL DEFAULT now()
);

-- Reverse-chron list is the only query path; index on (user_id, created_at desc)
-- gives both /api/notes ordering and the cursor (`before=<ISO timestamp>`).
CREATE INDEX IF NOT EXISTS notes_user_created_idx
  ON notes (user_id, created_at DESC);
