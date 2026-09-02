CREATE TABLE IF NOT EXISTS tutors_quizzes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id   text NOT NULL,
  title       text NOT NULL,
  questions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by  text NOT NULL,
  source      text NOT NULL DEFAULT 'dynamic',
  time_limit  integer,
  status      text NOT NULL DEFAULT 'draft',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_course_id
  ON tutors_quizzes (course_id);

ALTER TABLE tutors_quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quizzes_select" ON tutors_quizzes FOR SELECT USING (true);
CREATE POLICY "quizzes_insert" ON tutors_quizzes FOR INSERT
  WITH CHECK (created_by = current_setting('request.jwt.claims', true)::json->>'sub');
CREATE POLICY "quizzes_update" ON tutors_quizzes FOR UPDATE
  USING (created_by = current_setting('request.jwt.claims', true)::json->>'sub');
CREATE POLICY "quizzes_delete" ON tutors_quizzes FOR DELETE
  USING (created_by = current_setting('request.jwt.claims', true)::json->>'sub');

-- Quiz sessions (live quiz instances)
CREATE TABLE IF NOT EXISTS tutors_quiz_sessions (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id           uuid NOT NULL REFERENCES tutors_quizzes(id) ON DELETE CASCADE,
  course_id         text NOT NULL,
  lecturer_id       text NOT NULL,
  status            text NOT NULL DEFAULT 'waiting',
  current_question  integer NOT NULL DEFAULT 0,
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_course_id
  ON tutors_quiz_sessions (course_id);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_quiz_id
  ON tutors_quiz_sessions (quiz_id);

ALTER TABLE tutors_quiz_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_sessions_select" ON tutors_quiz_sessions FOR SELECT USING (true);
CREATE POLICY "quiz_sessions_insert" ON tutors_quiz_sessions FOR INSERT
  WITH CHECK (lecturer_id = current_setting('request.jwt.claims', true)::json->>'sub');
CREATE POLICY "quiz_sessions_update" ON tutors_quiz_sessions FOR UPDATE
  USING (lecturer_id = current_setting('request.jwt.claims', true)::json->>'sub');
CREATE POLICY "quiz_sessions_delete" ON tutors_quiz_sessions FOR DELETE
  USING (lecturer_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Quiz responses (student answers)
CREATE TABLE IF NOT EXISTS tutors_quiz_responses (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id         uuid NOT NULL REFERENCES tutors_quizzes(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES tutors_quiz_sessions(id) ON DELETE SET NULL,
  question_id     text NOT NULL,
  student_id      text NOT NULL,
  selected_index  integer NOT NULL,
  is_correct      boolean NOT NULL,
  response_time_ms integer NOT NULL DEFAULT 0,
  submitted_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (quiz_id, session_id, question_id, student_id)
);

-- Partial index for async (non-session) response deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_responses_async_unique
  ON tutors_quiz_responses (quiz_id, question_id, student_id)
  WHERE session_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_responses_quiz_id
  ON tutors_quiz_responses (quiz_id);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_session_id
  ON tutors_quiz_responses (session_id);

ALTER TABLE tutors_quiz_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_responses_select" ON tutors_quiz_responses FOR SELECT USING (true);
CREATE POLICY "quiz_responses_insert" ON tutors_quiz_responses FOR INSERT
  WITH CHECK (student_id = current_setting('request.jwt.claims', true)::json->>'sub');
CREATE POLICY "quiz_responses_update" ON tutors_quiz_responses FOR UPDATE
  USING (student_id = current_setting('request.jwt.claims', true)::json->>'sub');
CREATE POLICY "quiz_responses_delete" ON tutors_quiz_responses FOR DELETE
  USING (student_id = current_setting('request.jwt.claims', true)::json->>'sub');
