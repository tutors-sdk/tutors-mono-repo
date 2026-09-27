-- ============================================================================
-- Tutors reporting views for Grafana
-- ============================================================================
-- The underlying schema is inconsistent (some tables hyphenated and must be
-- double-quoted; learning_records uses snake_case while calendar uses
-- nounderscore). These views present clean, stable column names so dashboards
-- don't depend on those quirks. Column/table names below reflect the ACTUAL
-- schema the Tutors app code reads/writes (not docs/DATA-INVENTORY.md, which is
-- out of date as of 2026-08-31).
--
-- Run against each database Grafana points at (local Supabase and/or staging):
--   psql "$CONN" -f reporting_views.sql
-- Then run grafana_reader.sql to grant the read-only role access to them.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS tutors_reporting;

-- Daily engagement, one row per (day, course). `calendar.id` is a 'YYYY-MM-DD'
-- string; `timeactive` is seconds active that day.
CREATE OR REPLACE VIEW tutors_reporting.v_daily_engagement AS
SELECT
  (c.id)::date                         AS day,
  c.courseid                           AS course_id,
  COUNT(DISTINCT c.studentid)          AS active_students,
  SUM(c.timeactive)                    AS seconds_active,
  SUM(c.pageloads)                     AS page_loads
FROM calendar c
WHERE c.id ~ '^\d{4}-\d{2}-\d{2}$'     -- skip any malformed date keys
GROUP BY (c.id)::date, c.courseid;

-- Time spent per learning object. `duration` is an incrementing engagement
-- counter (bumped once per active interval), `count` is page/interaction count.
CREATE OR REPLACE VIEW tutors_reporting.v_lo_time AS
SELECT
  lr.course_id                         AS course_id,
  lr.lo_id                             AS lo_id,
  lr.type                              AS lo_type,
  COUNT(DISTINCT lr.student_id)        AS students,
  SUM(lr.duration)                     AS duration_units,
  SUM(lr.count)                        AS interactions
FROM learning_records lr
GROUP BY lr.course_id, lr.lo_id, lr.type;

-- Per-student activity, enriched with display name where available.
-- student_id (the GitHub login) maps to "tutors-connect-users".github_id.
CREATE OR REPLACE VIEW tutors_reporting.v_student_activity AS
SELECT
  lr.student_id                        AS student_id,
  u.full_name                          AS full_name,
  u.online_status                      AS online_status,
  u.sentiment                          AS sentiment,
  COUNT(DISTINCT lr.course_id)         AS courses,
  COUNT(DISTINCT lr.lo_id)             AS learning_objects,
  SUM(lr.duration)                     AS duration_units,
  SUM(lr.count)                        AS interactions,
  MAX(lr.date_last_accessed)           AS last_accessed
FROM learning_records lr
LEFT JOIN "tutors-connect-users" u
  ON u.github_id = lr.student_id
GROUP BY lr.student_id, u.full_name, u.online_status, u.sentiment;

-- Per-course rollup from daily engagement.
CREATE OR REPLACE VIEW tutors_reporting.v_course_activity AS
SELECT
  course_id,
  COUNT(DISTINCT day)                  AS active_days,
  MAX(day)                             AS last_active_day,
  SUM(active_students)                 AS student_day_count,
  SUM(seconds_active)                  AS seconds_active,
  SUM(page_loads)                      AS page_loads
FROM tutors_reporting.v_daily_engagement
GROUP BY course_id;

-- Application errors for the ops/observability panels.
CREATE OR REPLACE VIEW tutors_reporting.v_errors AS
SELECT
  created_at                           AS time,
  app,
  level,
  message,
  course_id,
  student_id
FROM app_errors;
