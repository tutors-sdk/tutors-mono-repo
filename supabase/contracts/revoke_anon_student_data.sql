-- CONTRACT STEP FOR THE RELEASE AFTER PR #320. NOT A MIGRATION YET.
--
-- Removes the anon access that browsers of releases up to v16.2.2 still use to write student data.
-- The release that ships PR #320 moves those writes to the reader's /api routes; this file may only
-- run once no pod or open tab of an earlier release is left. So it lives outside supabase/migrations
-- (which `supabase db push` and the release harness apply), and it refuses to run by accident.
--
-- To ship it, in the release after the one that contains PR #320 (guides/SERVER-WRITES.md):
--   1. move it to supabase/migrations/<timestamp>_revoke_anon_student_data.sql;
--   2. replace the line below with "-- contract-for: v<the release that shipped PR #320>";
--      `pnpm check:migrations` refuses it until CHANGELOG.md records that version as released;
--   3. delete the guard (the first IF in the block below), and claim its drops in release/claims.yaml.
-- contract-for: (set when promoting; see step 2)
--
-- Run by hand before then (a rehearsal on a copy of production): SET tutors.contract_ok = 'on'; first.
-- The whole file is one DO block, so when the guard refuses, nothing in it runs, whichever client
-- runs the file and whether or not it stops on the first error.
--
-- Old tabs must reload: their direct anon writes will fail after this migration.
-- The tables below predate the migration directory on production, so skip absent
-- tables in local databases. Revoking grants closes access even if a policy was
-- installed by hand under a different name.
DO $$
DECLARE
  item record;
  policy_name text;
  fn record;
BEGIN
  IF coalesce(current_setting('tutors.contract_ok', true), '') <> 'on' THEN
    RAISE EXCEPTION 'revoke_anon_student_data is a contract step for the release after PR #320; set tutors.contract_ok = on to run it deliberately';
  END IF;

  FOR item IN SELECT * FROM (VALUES
    ('tutors-connect-users', ARRAY['anon_select', 'anon_insert', 'anon_update'], false),
    ('tutors-connect-profiles', ARRAY['anon_select', 'anon_insert', 'anon_update'], false),
    ('tutors-connect-latest', ARRAY['anon_insert', 'anon_update'], true),
    ('tutors-connect-courses', ARRAY['anon_insert', 'anon_update', 'anon_delete'], true),
    ('learning_records', ARRAY['anon_select', 'anon_insert', 'anon_update'], false),
    ('calendar', ARRAY['anon_select', 'anon_insert', 'anon_update'], false),
    ('assignments', ARRAY['anon_select', 'anon_insert', 'anon_update'], false),
    ('assignments_submissions', ARRAY['anon_select', 'anon_insert', 'anon_update'], false),
    ('tutors_content_locks', ARRAY['content_locks_insert', 'content_locks_update', 'content_locks_delete'], true)
  ) AS contract(table_name, policies, public_read) LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NULL THEN CONTINUE; END IF;
    FOREACH policy_name IN ARRAY item.policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, item.table_name);
    END LOOP;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, PUBLIC', item.table_name);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', item.table_name);
    IF item.public_read THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', item.table_name);
    END IF;
    IF has_table_privilege('anon', format('public.%I', item.table_name), 'INSERT')
      OR has_table_privilege('anon', format('public.%I', item.table_name), 'UPDATE')
      OR has_table_privilege('anon', format('public.%I', item.table_name), 'DELETE')
      OR has_table_privilege('anon', format('public.%I', item.table_name), 'SELECT') <> item.public_read THEN
      RAISE EXCEPTION 'anon access remains on %', item.table_name;
    END IF;
  END LOOP;

  -- These RPCs accept a student id from their caller. They are server-only now.
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('get_count_learning_records', 'increment_calendar')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
    IF has_function_privilege('anon', fn.signature::text, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon can still execute %', fn.signature;
    END IF;
  END LOOP;

  -- whiteboard_scenes comes from 20260925100000. The old hand-run script installed a public read
  -- policy on some databases (never on tutors-prod).
  DROP POLICY IF EXISTS "Anyone can read whiteboard scenes" ON public.whiteboard_scenes;
  DROP POLICY IF EXISTS "Authenticated users can upsert whiteboard scenes" ON public.whiteboard_scenes;
  REVOKE ALL PRIVILEGES ON TABLE public.whiteboard_scenes FROM anon, PUBLIC;
  GRANT ALL PRIVILEGES ON TABLE public.whiteboard_scenes TO service_role;
END $$;
