-- Adds sync state columns to users table for the dashboard's first-run UX.
-- The dashboard polls /api/canvas/sync-status and renders phase-appropriate copy
-- (idle | courses | assignments | grades | done | error).
-- Nullable so existing rows are unaffected.
-- IF NOT EXISTS: 0000_init already creates these columns on fresh DBs.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_phase" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_error" text;