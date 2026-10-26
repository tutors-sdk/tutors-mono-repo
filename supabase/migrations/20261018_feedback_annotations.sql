-- Lecturer feedback on lab steps (@tutors/feedback, Rules 0400-0409).
--
-- An annotation is anchored to one lab step and addressed to one student or to everyone on the
-- step; one for everyone is a broadcast, shown as a banner on the step and toasted elsewhere in the
-- course (Rule 0400). A revoked annotation is kept with its revocation time for the review history
-- (Rule 0406).
--
-- Only the reader's server reads and writes this table, as the signed-in actor, with the
-- service-role key (PRIVATE_SUPABASE_SERVICE_ROLE_KEY; Rule 0565). RLS is on with no policy, so the
-- anon key every browser holds can neither read another student's feedback nor forge a lecturer's.
-- Expand only: a new table and its indexes.

CREATE TABLE IF NOT EXISTS public.feedback_annotations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id   TEXT NOT NULL,
  lab_route   TEXT NOT NULL,
  step_id     TEXT NOT NULL,
  audience    TEXT NOT NULL CHECK (audience IN ('student', 'everyone')),
  learner_id  TEXT,
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  author_id   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  CHECK ((audience = 'everyone') = (learner_id IS NULL))
);

ALTER TABLE public.feedback_annotations ENABLE ROW LEVEL SECURITY;
-- Supabase grants table privileges to anon and authenticated by default; RLS already closes the
-- rows, and revoking says so in the catalogue too. Roles a plain Postgres (the release harness's
-- rehearsal) lacks are skipped.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON public.feedback_annotations FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

-- A step's annotations: what a student on the step reads, in one query (Rule 0403).
CREATE INDEX IF NOT EXISTS idx_feedback_annotations_step
  ON public.feedback_annotations (course_id, lab_route, step_id, created_at);

-- What a student received in a course (Rule 0409): theirs, and the course's broadcasts.
CREATE INDEX IF NOT EXISTS idx_feedback_annotations_learner
  ON public.feedback_annotations (course_id, learner_id, created_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_annotations_broadcasts
  ON public.feedback_annotations (course_id, created_at DESC)
  WHERE audience = 'everyone' AND revoked_at IS NULL;
