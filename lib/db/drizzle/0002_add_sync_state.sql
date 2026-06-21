-- Adds sync state columns to users table for the dashboard's first-run UX.
-- The dashboard polls /api/canvas/sync-status and renders phase-appropriate copy
-- (idle | courses | assignments | grades | done | error).
-- Nullable so existing rows are unaffected.

ALTER TABLE "users" ADD COLUMN "last_sync_phase" text;
ALTER TABLE "users" ADD COLUMN "last_sync_at" timestamp;
ALTER TABLE "users" ADD COLUMN "last_sync_error" text;