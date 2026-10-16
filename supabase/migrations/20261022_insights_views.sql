-- Learning insights in Tutors Time (@tutors/insights, Rules 0410 to 0417).
--
-- Insights write nothing (Rule 0410); they read the rows of assistance_requests
-- (20261020_assistance_requests.sql) and feedback_annotations (20261018_feedback_annotations.sql)
-- through these two views, never the tables. Each view is the rows' facts without their free text:
-- no student name, no hint, no annotation body, so nothing written to one student can reach a page
-- of numbers. The numbers themselves (ranks, medians, percentiles and their withholding for a small
-- cohort) are computed on the reader's server, not in SQL.
--
-- Only the reader's server reads the views (GET /api/insights), with the service-role key, after it
-- has checked that the person signed in teaches the course. The views run as the caller
-- (security_invoker), so the tables' RLS, which admits no anon or authenticated call, holds for them
-- too, and their privileges are revoked from those roles as the tables' are.
--
-- Every read names a course and a half-open period, over an index that leads with the course and
-- the time it filters on (Rule 0417).
--
-- Expand only: two new views and two new indexes. The previous release never reads them.

CREATE OR REPLACE VIEW public.insights_help_requests WITH (security_invoker = true) AS
  SELECT id, course_id, lab_route, step_id, learner_id, kind, requested_at,
         acknowledged_at, closed_at, closed_reason
  FROM public.assistance_requests;

CREATE OR REPLACE VIEW public.insights_annotations WITH (security_invoker = true) AS
  SELECT id, course_id, lab_route, step_id, learner_id, created_at, revoked_at
  FROM public.feedback_annotations;

-- Roles a plain Postgres (the release harness's rehearsal) lacks are skipped.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON public.insights_help_requests FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON public.insights_annotations FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_assistance_requests_course_time
  ON public.assistance_requests (course_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_feedback_annotations_course_time
  ON public.feedback_annotations (course_id, created_at);
