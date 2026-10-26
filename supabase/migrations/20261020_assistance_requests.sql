-- Help requests on lab steps: a signed-in student says they are stuck, need a hint or need the
-- lecturer, and the course's educators acknowledge, answer or resolve it.
--
-- Only the reader's server reads and writes these rows (GET and POST /api/assistance), with the
-- service role key, after it has checked who is signed in and whether they teach the course. RLS is
-- on with no policy, so the anon key every browser holds can neither read nor change a request.
--
-- One row per request, carrying its step (course, lab route, step id), who asked, the kind, the
-- state, who acknowledged and who ended it, and the lecturer's typed hint. Waiting time is never
-- stored; it is the clock minus requested_at. A learner has at most one live request per course: the
-- partial unique index refuses a second one, so two tabs asking at once cannot both win.
--
-- Expand only: one new table, its indexes and one new function. The previous release never calls them.
-- The release harness rehearses this on a database that has only app_errors, so the function is
-- plpgsql and the grant to service_role, a role the harness lacks, sits in a guarded DO block.

CREATE TABLE IF NOT EXISTS public.assistance_requests (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id        text NOT NULL CHECK (length(course_id) BETWEEN 1 AND 200),
  lab_route        text NOT NULL CHECK (length(lab_route) BETWEEN 1 AND 512),
  step_id          text NOT NULL CHECK (length(step_id) BETWEEN 1 AND 200),
  learner_id       text NOT NULL CHECK (length(learner_id) BETWEEN 1 AND 100),
  learner_name     text,
  kind             text NOT NULL CHECK (kind IN ('stuck', 'hint', 'lecturer')),
  state            text NOT NULL CHECK (state IN ('open', 'acknowledged', 'resolved', 'withdrawn')),
  requested_at     timestamptz NOT NULL,
  acknowledged_by  text,
  acknowledged_at  timestamptz,
  closed_by        text,
  closed_at        timestamptz,
  closed_reason    text CHECK (closed_reason IN ('resolved', 'hint', 'withdrawn', 'expired')),
  hint_text        text CHECK (length(hint_text) <= 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistance_requests_one_live
  ON public.assistance_requests (course_id, learner_id)
  WHERE state IN ('open', 'acknowledged');

-- The queue's read: a course's live requests.
CREATE INDEX IF NOT EXISTS idx_assistance_requests_live
  ON public.assistance_requests (course_id)
  WHERE state IN ('open', 'acknowledged');

-- No policies: only the service role, which bypasses RLS, reaches the rows.
ALTER TABLE public.assistance_requests ENABLE ROW LEVEL SECURITY;

-- Called by the reader's server after a help request changes. Tutors Live hears a course's help queue
-- on the topic 'assistance:<course id>' (topics.helpQueue in @tutors/realtime) and reports itself as a
-- watcher of it through realtime_watch, as for the activity feeds. Answers whether to publish: only
-- while the topic has a watcher and Live's budget is not paused, charging 1 + watchers to today's
-- budget in the same statement. See 20261016_realtime_live_budget.sql.
CREATE OR REPLACE FUNCTION public.realtime_claim_assistance_publish(p_course_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s realtime_settings%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'utc')::date;
  v_topic text;
  v_tier text;
  v_watchers bigint;
BEGIN
  IF p_course_id IS NULL OR length(p_course_id) = 0 OR length(p_course_id) > 200 THEN
    RAISE EXCEPTION 'realtime_claim_assistance_publish: course id must be 1 to 200 characters' USING ERRCODE = '22023';
  END IF;
  v_topic := 'assistance:' || p_course_id;

  SELECT * INTO s FROM realtime_settings WHERE id;
  DELETE FROM realtime_watchers WHERE seen_at < now() - make_interval(secs => s.watcher_ttl_seconds);

  v_tier := live_budget_tier(v_day);
  SELECT count(*) INTO v_watchers FROM realtime_watchers WHERE topic = v_topic;
  IF v_tier = 'paused' OR v_watchers = 0 THEN
    RETURN jsonb_build_object('tier', v_tier, 'publish', false);
  END IF;

  INSERT INTO realtime_budget (day, sent) VALUES (v_day, 1 + v_watchers)
  ON CONFLICT (day) DO UPDATE SET sent = realtime_budget.sent + EXCLUDED.sent;
  RETURN jsonb_build_object('tier', v_tier, 'publish', true);
END;
$$;

-- Only the reader's server, with the service role key, may charge Live's budget for a help queue.
REVOKE EXECUTE ON FUNCTION public.realtime_claim_assistance_publish(text) FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.realtime_claim_assistance_publish(text) FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.realtime_claim_assistance_publish(text) TO service_role;
  END IF;
END $$;
