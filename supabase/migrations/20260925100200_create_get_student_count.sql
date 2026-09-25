-- The catalogue shows how many students use Tutors by counting rows of
-- "tutors-connect-profiles" with the anon key. Those rows are personal (each is one
-- student's course-visit history), and the anon SELECT policy that makes the count
-- work also lets anyone download them. This function returns only the number, so
-- the catalogue can switch to it now and the anon SELECT policy can be removed in a
-- later release (guides/SERVER-WRITES.md). A database without the table (local, the
-- release harness) still gets the function; it returns 0 there.
CREATE OR REPLACE FUNCTION get_student_count()
RETURNS BIGINT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regclass('public."tutors-connect-profiles"') IS NULL THEN
    RETURN 0;
  END IF;
  RETURN (SELECT COUNT(*) FROM public."tutors-connect-profiles");
END;
$$;

REVOKE ALL ON FUNCTION get_student_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_student_count() TO anon, authenticated, service_role;
