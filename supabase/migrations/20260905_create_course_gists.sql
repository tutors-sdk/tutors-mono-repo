-- Ephemeral snippet sharing (issue #155) — GitHub-backed, 48h TTL.
--
-- Two tables:
--   * course_gists       : public metadata the lecturer dashboard reads, and
--                          the student's own confirmation reads. Readable by
--                          anon-key browser clients (the time app), never
--                          writable by them — writes go through the reader's
--                          server endpoint and the GH Actions cleanup job.
--   * course_gist_secrets: the GitHub access token used by the cleanup job to
--                          DELETE the gist on GitHub once the 48h cap is
--                          reached. Never readable by anon-key clients.
--
-- Design notes:
--   * expires_at IS the server-computed `created_at + 48h`. Reads always
--     filter `expires_at > now()` (see anon_select_course_gists), so an
--     expired row is invisible before the cleanup job physically deletes it.
--   * The cleanup job (GH Actions cron) physically deletes the rows AND the
--     corresponding gists on GitHub (best-effort: if the user has revoked
--     their token, the row is still removed so it stops surfacing).
--   * course_gist_secrets uses CASCADE delete so removing the public row
--     also drops the stored token.

CREATE TABLE IF NOT EXISTS course_gists (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  -- Server-computed to `created_at + 48h` on insert. Never client-supplied.
  expires_at   TIMESTAMPTZ NOT NULL,
  course_id    TEXT NOT NULL,
  -- GitHub login of the creator. Matches tutors-connect-users.github_id and
  -- is used by the lecturer dashboard to enrich names / avatars.
  student_id   TEXT NOT NULL,
  student_name TEXT,
  -- GitHub gist id (uuid). Used by the cleanup job for DELETE /gists/{id}.
  gist_id      TEXT NOT NULL,
  -- Human-friendly URL (https://gist.github.com/…) shown in the toast action
  -- button and in the dashboard table.
  gist_url     TEXT NOT NULL,
  -- Optional label supplied by the student at creation time.
  title        TEXT,
  -- Learning object (LO) the snippet was shared from, for dashboards.
  lo_route     TEXT,
  lo_title     TEXT
);

CREATE INDEX idx_course_gists_course ON course_gists (course_id, created_at DESC);
CREATE INDEX idx_course_gists_expiry ON course_gists (expires_at);

-- Separate secret table so browser clients that can SELECT course_gists
-- never see the GitHub access token.
CREATE TABLE IF NOT EXISTS course_gist_secrets (
  gist_id      UUID NOT NULL REFERENCES course_gists(id) ON DELETE CASCADE,
  github_token TEXT NOT NULL,
  PRIMARY KEY (gist_id)
);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

-- Course gists are read-only for anon (dashboard + reader confirmation both
-- read). INSERT / UPDATE / DELETE are intentionally NOT allowed for anon, so
-- the reader endpoint and the GH Actions cleanup job must write with a
-- service-role credential (which bypasses RLS).
ALTER TABLE course_gists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_course_gists" ON course_gists
  FOR SELECT TO anon
  USING (expires_at > now());

-- Secrets are fully closed to anon. Only a service-role (or superuser) row
-- can insert / select / delete. Browser clients do not need to see this
-- table at all.
ALTER TABLE course_gist_secrets ENABLE ROW LEVEL SECURITY;

-- Explicit index on the FK (Postgres does not auto-add one for a UNIQUE PK
-- that is the target of the FK in this case).
CREATE INDEX IF NOT EXISTS idx_course_gist_secrets_gist ON course_gist_secrets (gist_id);

-- -----------------------------------------------------------------------------
-- Expiration helper (used by the GH Actions cleanup job)
-- -----------------------------------------------------------------------------
-- Returns the expired rows that need to be physically deleted. Ordered by
-- earliest expiry so the job can process in deterministic batches.
CREATE OR REPLACE FUNCTION expired_course_gists(limit_rows INT DEFAULT 200)
RETURNS TABLE(id UUID, gist_id TEXT) AS $$
  SELECT id, gist_id
  FROM course_gists
  WHERE expires_at <= now()
  ORDER BY expires_at ASC
  LIMIT limit_rows;
$$ LANGUAGE sql STABLE;
