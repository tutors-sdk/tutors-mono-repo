-- A student's playground workspace, handed to their lecturer.
--
-- Playgrounds run and save entirely in the browser; a row only exists here because a
-- student pressed a button to share one. That makes this the first Tutors table whose
-- rows have an owner, so it is also the first with row-level security that means
-- anything: the reader mints a short-lived Supabase JWT from the signed-in GitHub
-- identity (see /api/runtime-token), and the policies below are written against that
-- token's claims rather than against the anon role.
CREATE TABLE IF NOT EXISTS playground_snapshots (
  student_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lo_id TEXT NOT NULL,
  student_name TEXT,
  runtime TEXT NOT NULL CHECK (runtime IN ('python', 'javascript', 'typescript')),
  entry TEXT NOT NULL,
  -- The whole workspace as [{path, content}]: what the student had, not a diff against
  -- the exercise, because the exercise may have moved on since.
  files JSONB DEFAULT '[]' NOT NULL,
  -- What the student saw the last time they ran it, which is usually the thing they want
  -- their lecturer to look at.
  last_output TEXT,
  last_ok BOOLEAN,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (student_id, course_id, lo_id)
);

CREATE INDEX idx_playground_snapshots_lo ON playground_snapshots (course_id, lo_id, updated_at DESC);

ALTER TABLE playground_snapshots ENABLE ROW LEVEL SECURITY;

-- A student reaches their own row and no other.
CREATE POLICY "own_snapshot_select" ON playground_snapshots
  FOR SELECT TO authenticated USING (student_id = auth.jwt() ->> 'sub');

CREATE POLICY "own_snapshot_insert" ON playground_snapshots
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.jwt() ->> 'sub');

CREATE POLICY "own_snapshot_update" ON playground_snapshots
  FOR UPDATE TO authenticated
  USING (student_id = auth.jwt() ->> 'sub')
  WITH CHECK (student_id = auth.jwt() ->> 'sub');

CREATE POLICY "own_snapshot_delete" ON playground_snapshots
  FOR DELETE TO authenticated USING (student_id = auth.jwt() ->> 'sub');

-- An educator reads the submissions of courses they teach, and only reads them. The claim
-- is a list of course ids put there by the reader after checking the course's own
-- enrollment.yaml, so a student cannot mint themselves into it.
CREATE POLICY "educator_snapshot_select" ON playground_snapshots
  FOR SELECT TO authenticated
  USING (coalesce(auth.jwt() -> 'educator_courses', '[]'::jsonb) ? course_id);

-- The anon role is deliberately absent from every policy above. A playground that is never
-- shared never reaches this table at all.
