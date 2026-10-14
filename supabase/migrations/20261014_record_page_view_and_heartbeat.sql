-- Single-request writes for the reader's learning analytics.
--
-- A page view used to cost six requests (two get_count_learning_records reads, an upsert on
-- learning_records, two selects and an upsert on calendar) and every visible reader tab cost three
-- more every 30 seconds (a read, an update on learning_records, increment_calendar). The counters were
-- read in the browser and written back, so two tabs could lose each other's increments. These two
-- functions do the same writes atomically in one request each.
--
-- Expand only: two new functions. The previous release keeps calling the old ones, which stay, and
-- the reader falls back to them while these are missing (Rule 0305). SECURITY INVOKER (the default),
-- so row level security applies exactly as it does to the per-table requests they replace.

-- Rule 0303: one page view adds one to count and duration on the learning record (creating it at 1)
-- and to pageloads and timeactive on the day's calendar row (creating it at 1).
CREATE OR REPLACE FUNCTION public.record_page_view(p_course_id text, p_student_id text, p_lo_id text, p_lo_type text, p_day date)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO learning_records (course_id, student_id, lo_id, duration, count, date_last_accessed, type)
  VALUES (p_course_id, p_student_id, p_lo_id, 1, 1, now(), p_lo_type)
  ON CONFLICT (student_id, course_id, lo_id) DO UPDATE
    SET duration = COALESCE(learning_records.duration, 0) + 1,
        count = COALESCE(learning_records.count, 0) + 1,
        date_last_accessed = now(),
        type = EXCLUDED.type;

  INSERT INTO calendar (id, studentid, courseid, timeactive, pageloads)
  VALUES (p_day, p_student_id, p_course_id, 1, 1)
  ON CONFLICT (id, studentid, courseid) DO UPDATE
    SET timeactive = COALESCE(calendar.timeactive, 0) + 1,
        pageloads = COALESCE(calendar.pageloads, 0) + 1;
$$;

-- Rule 0304: 30 seconds on a visible page adds one to duration on the learning record (when the page
-- has one) and to timeactive on the day's calendar row. Like the requests it replaces, it updates
-- existing rows only; the page view that came first created them.
CREATE OR REPLACE FUNCTION public.record_heartbeat(p_course_id text, p_student_id text, p_lo_id text, p_day date)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE learning_records
    SET duration = COALESCE(duration, 0) + 1
    WHERE p_lo_id IS NOT NULL AND course_id = p_course_id AND student_id = p_student_id AND lo_id = p_lo_id;

  UPDATE calendar
    SET timeactive = COALESCE(timeactive, 0) + 1
    WHERE id = p_day AND studentid = p_student_id AND courseid = p_course_id;
$$;
