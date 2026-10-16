-- Whether a help request helped: once a request is resolved, the reader asks the student once
-- whether it helped and the reader's server keeps the answer on the request (Rule 0398). Null until
-- the student answers.
--
-- Expand only: one nullable column and one index on assistance_requests
-- (20261020_assistance_requests.sql). The previous release never reads them.

ALTER TABLE public.assistance_requests ADD COLUMN IF NOT EXISTS helped boolean;

-- A student's own latest request in a course: the reader shows a lecturer's hint and asks whether
-- it helped from it after the request has left the queue.
CREATE INDEX IF NOT EXISTS idx_assistance_requests_learner_latest
  ON public.assistance_requests (course_id, learner_id, requested_at DESC);
