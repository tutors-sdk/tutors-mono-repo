CREATE TABLE IF NOT EXISTS tutors_content_locks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id   text NOT NULL,
  lo_route    text NOT NULL,
  locked      boolean NOT NULL DEFAULT true,
  locked_by   text NOT NULL,
  locked_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (course_id, lo_route)
);

CREATE INDEX IF NOT EXISTS idx_content_locks_course_id
  ON tutors_content_locks (course_id);

ALTER TABLE tutors_content_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_locks_select"
  ON tutors_content_locks FOR SELECT
  USING (true);

CREATE POLICY "content_locks_insert"
  ON tutors_content_locks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "content_locks_update"
  ON tutors_content_locks FOR UPDATE
  USING (true);

CREATE POLICY "content_locks_delete"
  ON tutors_content_locks FOR DELETE
  USING (true);
