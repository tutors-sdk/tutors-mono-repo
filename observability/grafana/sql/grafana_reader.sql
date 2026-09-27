-- ============================================================================
-- Read-only role for Grafana
-- ============================================================================
-- Grafana connects as a direct Postgres role, which BYPASSES Supabase RLS. This
-- role is therefore the entire security boundary for what Grafana can see. Grant
-- it access ONLY to the reporting views, not raw PII tables, and never point
-- Grafana at the service_role or a superuser.
--
-- Run AFTER reporting_views.sql, against each database Grafana points at:
--   psql "$CONN" -f grafana_reader.sql
--
-- Set a real password before running (or ALTER ROLE ... PASSWORD afterwards) and
-- put the same value in observability/grafana/.env as STAGING_DB_PASSWORD.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_reader') THEN
    CREATE ROLE grafana_reader LOGIN PASSWORD 'change-me-before-use';
  END IF;
END
$$;

-- No inherited table privileges; grant only the reporting schema + views.
GRANT USAGE ON SCHEMA tutors_reporting TO grafana_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA tutors_reporting TO grafana_reader;

-- Views created later in tutors_reporting are auto-granted to the reader.
ALTER DEFAULT PRIVILEGES IN SCHEMA tutors_reporting
  GRANT SELECT ON TABLES TO grafana_reader;

-- Belt-and-braces: make sure the role cannot read the raw PII tables directly.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM grafana_reader;
