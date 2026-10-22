-- Tables production has that no migration creates: Tutors' Supabase schema
-- predates supabase/migrations, so only app_errors and later have a migration.
-- Migrations from 17.0.0 on index and write these tables (20261013, 20261014,
-- 20261015), so a rehearsal that starts from the bare baseline fails with
-- "relation does not exist". Applied after supabase-baseline.sql and before
-- version a's migrations, unless --snapshot supplies the real schema.
--
-- Shapes follow the row types in the monorepo (packages/jsr/types/src/rows.ts)
-- and the unique keys follow its upserts' onConflict targets. Tables with no
-- row type there (tutors-connect-profiles, assignments, ...) are left out until
-- a migration needs them. When the schema moves into migrations, drop this file.
CREATE TABLE IF NOT EXISTS public."tutors-connect-users" (
  github_id text PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  online_status text,
  date_last_accessed timestamptz,
  sentiment text
);

CREATE TABLE IF NOT EXISTS public."tutors-connect-courses" (
  course_id text PRIMARY KEY,
  visited_at timestamptz NOT NULL DEFAULT now(),
  visit_count bigint,
  course_record json
);

CREATE TABLE IF NOT EXISTS public."tutors-connect-latest" (
  course_id text NOT NULL,
  student_id text NOT NULL,
  payload jsonb,
  received_at timestamptz,
  UNIQUE (course_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.calendar (
  id date NOT NULL,
  studentid text NOT NULL,
  courseid text NOT NULL,
  timeactive bigint,
  pageloads bigint,
  UNIQUE (id, studentid, courseid)
);

CREATE TABLE IF NOT EXISTS public.learning_records (
  course_id text NOT NULL,
  student_id text NOT NULL,
  lo_id text,
  duration bigint,
  count bigint,
  date_last_accessed timestamptz,
  type text,
  UNIQUE (student_id, course_id, lo_id)
);
