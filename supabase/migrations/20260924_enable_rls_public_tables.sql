-- Enable Row-Level Security on every table in public.
--
-- Supabase advisor rls_disabled_in_public (critical, 19 Sep 2026): 14 tables in
-- tutors-prod had RLS off, so the anon key every browser holds could read,
-- change, delete and truncate them. Applied by hand to tutors-prod on
-- 24 Sep 2026; this file records it so every other database matches.
--
-- The apps sign in with Auth.js, not Supabase Auth, so every call arrives as
-- anon. The tables they use keep exactly the operations the code performs
-- (upsert needs SELECT, INSERT and UPDATE); DELETE stays only where the
-- catalogue clean-up needs it. Every other table gets RLS with no policy,
-- closing it to anon while service_role and postgres still bypass RLS.
--
-- Policies go only on tables whose RLS is still off, so a table that already
-- has its own policies is never widened, and a database that lacks these
-- tables (local, the release harness) skips them. A second run does nothing.
-- ponytail: USING (true) still lets anon touch any student's rows; per-user
-- policies need server-side writes or a Supabase JWT minted from the session.
DO $$
DECLARE r record; op text;
BEGIN
  FOR r IN
    SELECT v.tbl, v.ops FROM (VALUES
      ('tutors-connect-users',    'SELECT,INSERT,UPDATE'),
      ('tutors-connect-profiles', 'SELECT,INSERT,UPDATE'),
      ('tutors-connect-latest',   'SELECT,INSERT,UPDATE'),
      ('tutors-connect-courses',  'SELECT,INSERT,UPDATE,DELETE'),
      ('learning_records',        'SELECT,INSERT,UPDATE'),
      ('calendar',                'SELECT,INSERT,UPDATE'),
      ('assignments',             'SELECT,INSERT,UPDATE'),
      ('assignments_submissions', 'SELECT,INSERT,UPDATE')
    ) AS v(tbl, ops)
    JOIN pg_class c ON c.relname = v.tbl AND c.relnamespace = 'public'::regnamespace
    WHERE NOT c.relrowsecurity
  LOOP
    FOREACH op IN ARRAY string_to_array(r.ops, ',') LOOP
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO anon %s',
        'anon_' || lower(op), r.tbl, op,
        CASE op WHEN 'INSERT' THEN 'WITH CHECK (true)'
                WHEN 'UPDATE' THEN 'USING (true) WITH CHECK (true)'
                ELSE 'USING (true)' END);
    END LOOP;
  END LOOP;

  FOR r IN SELECT relname AS tbl FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p') AND NOT relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);
  END LOOP;
END $$;
