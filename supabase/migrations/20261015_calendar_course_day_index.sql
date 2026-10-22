-- Tutors Time reads a course's calendar for a date range (course-time.ts getCalendarData):
-- courseid = $1 AND id BETWEEN $2 AND $3, ordered by id. Its upsert key is (id, studentid, courseid),
-- which leads with the day, so this index lets the read go straight to one course's days.
-- Expand only: a new index, so the previous release keeps working unchanged.
CREATE INDEX IF NOT EXISTS idx_calendar_course_day
  ON public.calendar (courseid, id);
