-- Ephemeral snippet sharing (issue #155) — Supabase-backed, 48h TTL.
--
-- Snippet bodies live in Postgres. Nothing is stored on GitHub, so Tutors
-- never asks a student for the `gist` OAuth scope and never holds a GitHub
-- access token on their behalf.
--
-- Access model
-- ------------
-- This table is CLOSED to the anon role. There is deliberately no anon policy
-- of any kind: the anon key ships in every client bundle, so an anon SELECT
-- policy would make every student's code readable by anyone who opens
-- devtools. Both reads and writes go through server routes holding the
-- service-role key, which check that the caller is an educator of the course
-- (enrollment.yaml `educators`, fetched from the course's tutors.json).
--
-- Realtime carries only a content-free "something was shared in course X"
-- ping; the dashboard then re-fetches through the authorised route. Supabase
-- broadcast on the anon key is readable by anyone, so no snippet data — not
-- even a student name or title — is ever put on the wire.
--
-- Expiry
-- ------
-- expires_at is server-computed as created_at + 48h and is never client
-- supplied. Reads filter `expires_at > now()` so an expired snippet is
-- invisible before the cleanup job physically removes it.

-- The GitHub-backed design stored an OAuth token per snippet. That table is
-- gone; drop it if a previous revision of this migration was ever applied.
DROP TABLE IF EXISTS course_gist_secrets;

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
  -- The snippet itself.
  filename     TEXT,
  content      TEXT NOT NULL,
  -- Optional label supplied by the student at creation time.
  title        TEXT,
  -- Learning object (LO) the snippet was shared from, for dashboards.
  lo_route     TEXT,
  lo_title     TEXT
);

-- `IF NOT EXISTS` above is a no-op against a table left over from the
-- GitHub-backed revision, which had `gist_id`/`gist_url NOT NULL` and no
-- body columns — every insert would then fail on a missing `gist_id`.
-- Reshape it explicitly. All of these are no-ops on a fresh table.
ALTER TABLE course_gists ADD COLUMN IF NOT EXISTS filename TEXT;
ALTER TABLE course_gists ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE course_gists DROP COLUMN IF EXISTS gist_id;
ALTER TABLE course_gists DROP COLUMN IF EXISTS gist_url;
UPDATE course_gists SET content = '' WHERE content IS NULL;
ALTER TABLE course_gists ALTER COLUMN content SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_course_gists_course ON course_gists (course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_gists_expiry ON course_gists (expires_at);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- RLS is enabled with NO policies, which denies every anon and authenticated
-- request. Only the service-role key (which bypasses RLS) can touch this
-- table, and it is only ever used from server routes that have already
-- authorised the caller. Do not add an anon policy here.
ALTER TABLE course_gists ENABLE ROW LEVEL SECURITY;

-- Drop the policy from the previous GitHub-backed revision if present. It
-- allowed `FOR SELECT TO anon USING (expires_at > now())`, which exposed every
-- course's snippet metadata to any holder of the public anon key.
DROP POLICY IF EXISTS "anon_select_course_gists" ON course_gists;

-- -----------------------------------------------------------------------------
-- Expiration helper (used by the GH Actions cleanup job)
-- -----------------------------------------------------------------------------
-- Returns expired rows for physical deletion, earliest first so the job can
-- process deterministic batches.
-- Dropped first, not replaced: the GitHub-backed revision returned
-- `TABLE(id UUID, gist_id TEXT)`, and Postgres refuses CREATE OR REPLACE when
-- the return type changes ("cannot change return type of existing function").
DROP FUNCTION IF EXISTS expired_course_gists(INT);

CREATE FUNCTION expired_course_gists(limit_rows INT DEFAULT 200)
RETURNS TABLE(id UUID) AS $$
  SELECT id
  FROM course_gists
  WHERE expires_at <= now()
  ORDER BY expires_at ASC
  LIMIT limit_rows;
$$ LANGUAGE sql STABLE;
