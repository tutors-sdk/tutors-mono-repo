-- When each Moodle sync last completed, per Tutors course and Moodle scope (the Moodle course id, or
-- "<course>/<section>" for a section sync). The reader's moodle-sync route writes a row only after
-- every assignment and submission is saved, and throttles repeats on it (Rules 0651-0652); the
-- assignments rows' last_synced_at is written part way through a sync, so it cannot serve.
-- Expand only: a new table, which the previous release never reads. Only the service role writes it,
-- so it gets RLS with no anon policy.
CREATE TABLE IF NOT EXISTS public.moodle_syncs (
  courseid  TEXT        NOT NULL,
  scope     TEXT        NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (courseid, scope)
);

ALTER TABLE public.moodle_syncs ENABLE ROW LEVEL SECURITY;
