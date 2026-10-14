-- The reader's online list reads a course's recent activity once a minute per open tab
-- (presence.svelte.ts refreshCourseRoster): course_id = $1 AND received_at >= $2, newest first.
-- Expand only: a new index, so the previous release keeps working unchanged.
CREATE INDEX IF NOT EXISTS idx_tutors_connect_latest_course_recent
  ON public."tutors-connect-latest" (course_id, received_at DESC);
