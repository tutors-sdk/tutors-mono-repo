CREATE TABLE IF NOT EXISTS role_assignments (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text NOT NULL,
  course_id   text NOT NULL DEFAULT '',
  role        text NOT NULL DEFAULT 'student'
              CHECK (role IN ('student', 'educator', 'admin')),
  assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_role_assignments_user_id
  ON role_assignments (user_id);

CREATE INDEX IF NOT EXISTS idx_role_assignments_course_id
  ON role_assignments (course_id);

ALTER TABLE role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_assignments_select"
  ON role_assignments FOR SELECT
  USING (true);

CREATE POLICY "role_assignments_insert"
  ON role_assignments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "role_assignments_update"
  ON role_assignments FOR UPDATE
  USING (true);

CREATE POLICY "role_assignments_delete"
  ON role_assignments FOR DELETE
  USING (true);
