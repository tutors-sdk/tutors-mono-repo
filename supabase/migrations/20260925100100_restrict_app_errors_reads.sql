-- app_errors: browsers may report errors, but nobody holding the anon key may read them.
--
-- 20260822_create_app_errors.sql gave anon SELECT on every row, which would make
-- every error message, page URL, user agent and student_id publicly readable. The
-- table has never existed on tutors-prod, so no data and no deployed reader depends
-- on that policy; this is the cheapest moment to close it. Dropping a policy is a
-- contract step, claimed in release/claims.yaml (scope app_errors:anon_select_app_errors).
--
-- The anon INSERT policy stays: client-side error reporting inserts with
-- `Prefer: return=minimal`, which needs no SELECT.
DROP POLICY IF EXISTS "anon_select_app_errors" ON app_errors;

-- The /healthz endpoints of all four apps read error counts through this function
-- with the anon key. It returns aggregates only (app, level, count), never a row,
-- so it runs as its owner to keep working without the SELECT policy. The window is
-- clamped so a caller cannot ask for an unbounded scan.
CREATE OR REPLACE FUNCTION get_error_counts(minutes_ago INT DEFAULT 60)
RETURNS TABLE(app TEXT, level TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.app, e.level, COUNT(*)
  FROM public.app_errors e
  WHERE e.created_at > now() - make_interval(mins => LEAST(GREATEST(COALESCE(minutes_ago, 60), 1), 1440))
  GROUP BY e.app, e.level
  ORDER BY e.app, e.level;
$$;

REVOKE ALL ON FUNCTION get_error_counts(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_error_counts(INT) TO anon, authenticated, service_role;
