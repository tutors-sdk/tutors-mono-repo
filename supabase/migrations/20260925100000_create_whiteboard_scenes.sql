-- Whiteboard scenes: the saved edits of a whiteboard learning object, one row per room.
--
-- Until now this table was created by a hand-run script
-- (packages/svelte/utils/rbac/sql/003_whiteboard_scenes.sql) that was never run on
-- tutors-prod, so whiteboard saving has always failed there. That script's write
-- policy required the `authenticated` role, which the apps never have: Tutors signs
-- users in with Auth.js, so every browser call arrives as `anon`.
--
-- The reader now reads and saves scenes through its own server routes
-- (apps/reader/src/routes/api/whiteboard), which check the Auth.js session and use
-- the service_role key. So the table gets RLS with no policy at all: anon can
-- neither read personal rooms nor write any room, and service_role bypasses RLS.
-- A database where the old script already ran keeps its policies; this file never
-- removes them (that would be a contract step).
CREATE TABLE IF NOT EXISTS whiteboard_scenes (
  room_id TEXT PRIMARY KEY,
  elements JSONB NOT NULL DEFAULT '[]',
  app_state JSONB NOT NULL DEFAULT '{}',
  files JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whiteboard_scenes ENABLE ROW LEVEL SECURITY;
