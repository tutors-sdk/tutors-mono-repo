-- SCORM run-time state for imported packages, one row per learner per learning object.
-- Tutors plays the LMS role for a SCO, so it has to persist the whole CMI data model:
-- the SCO reads its own state back on resume, and only it knows what every element means.
-- The extracted columns are the subset Tutors itself reports on.
CREATE TABLE IF NOT EXISTS scorm_records (
  student_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lo_id TEXT NOT NULL,
  scorm_version TEXT NOT NULL CHECK (scorm_version IN ('1.2', '2004')),
  cmi JSONB DEFAULT '{}' NOT NULL,
  completion_status TEXT,
  success_status TEXT,
  score_raw NUMERIC,
  score_max NUMERIC,
  score_scaled NUMERIC,
  -- Accumulated seconds across every attempt, not the current session.
  total_time NUMERIC DEFAULT 0 NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (student_id, course_id, lo_id)
);

CREATE INDEX idx_scorm_records_course ON scorm_records (course_id, updated_at DESC);

ALTER TABLE scorm_records ENABLE ROW LEVEL SECURITY;

-- Matches the access model of learning_records: the reader writes as anon.
CREATE POLICY "anon_select_scorm_records" ON scorm_records
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_scorm_records" ON scorm_records
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_scorm_records" ON scorm_records
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
