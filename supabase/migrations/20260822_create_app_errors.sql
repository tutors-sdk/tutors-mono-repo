-- Error aggregation table for observability across all Tutors apps
CREATE TABLE IF NOT EXISTS app_errors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  app TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('warn', 'error')),
  message TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  url TEXT,
  user_agent TEXT,
  course_id TEXT,
  student_id TEXT
);

CREATE INDEX idx_app_errors_app_created ON app_errors (app, created_at DESC);
CREATE INDEX idx_app_errors_level ON app_errors (level, created_at DESC);
CREATE INDEX idx_app_errors_course ON app_errors (course_id, created_at DESC)
  WHERE course_id IS NOT NULL;

-- RLS: allow anon inserts (client-side error reporting) and reads (healthz/metrics)
ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_app_errors" ON app_errors
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_app_errors" ON app_errors
  FOR SELECT TO anon USING (true);

-- Metrics helper: error counts by app in the last N minutes
CREATE OR REPLACE FUNCTION get_error_counts(minutes_ago INT DEFAULT 60)
RETURNS TABLE(app TEXT, level TEXT, count BIGINT) AS $$
  SELECT app, level, COUNT(*)
  FROM app_errors
  WHERE created_at > now() - (minutes_ago || ' minutes')::INTERVAL
  GROUP BY app, level
  ORDER BY app, level;
$$ LANGUAGE sql STABLE;
