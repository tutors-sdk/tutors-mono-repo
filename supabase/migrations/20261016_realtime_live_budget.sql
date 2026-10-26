-- Tutors Live's activity feed under a daily Realtime budget.
--
-- Until now every reader page view broadcast its learning event twice from the browser (the platform
-- topic and the course topic), and Supabase billed one message per send plus one per receiving
-- subscriber whether or not Tutors Live was open. The reader now posts the event to its own server
-- (POST /api/live/activity), which asks realtime_claim_live_publish() which topics to publish to: only
-- topics a Tutors Live tab is watching, only within the day's budget. Tutors Live reports itself as a
-- watcher through realtime_watch() once a minute and reads stored activity instead while the budget
-- is paused.
--
-- Budget (approved 14 Oct 2026): 160k Realtime messages a day, of which 120k for Live. From 70% of it the
-- course feed only is published (the platform feed, the more expensive one, stops); from 90% nothing is
-- published until the next UTC day.
--
-- Expand only: three new tables and three new functions. The previous release keeps broadcasting from
-- the browser and never calls them.
--
-- The release harness rehearses this on a database that has only app_errors, so every function is
-- plpgsql (its body is not resolved at create time) and the grants to anon and authenticated, roles the
-- harness lacks, sit in a guarded DO block. Operator steps: ARCHITECTURE.md, "Tutors Live's daily budget".

CREATE TABLE IF NOT EXISTS public.realtime_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  live_daily_budget bigint NOT NULL DEFAULT 120000,
  slow_at numeric NOT NULL DEFAULT 0.7,
  pause_at numeric NOT NULL DEFAULT 0.9,
  watcher_ttl_seconds int NOT NULL DEFAULT 90
);
INSERT INTO public.realtime_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Realtime messages Live's publishing has spent per UTC day: 1 per publish plus 1 per watcher of the topic.
CREATE TABLE IF NOT EXISTS public.realtime_budget (
  day date PRIMARY KEY,
  sent bigint NOT NULL DEFAULT 0
);

-- One row per Tutors Live tab per topic, refreshed every 60 seconds and ignored after watcher_ttl_seconds.
CREATE TABLE IF NOT EXISTS public.realtime_watchers (
  topic text NOT NULL,
  watcher text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic, watcher)
);

-- No policies: only the SECURITY DEFINER functions below read or write these.
ALTER TABLE public.realtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_watchers ENABLE ROW LEVEL SECURITY;

-- 'normal' below slow_at of the day's budget, 'slow' from slow_at, 'paused' from pause_at.
-- A budget of 0 pauses Live's publishing outright.
CREATE OR REPLACE FUNCTION public.live_budget_tier(p_day date)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s realtime_settings%ROWTYPE;
  v_sent bigint;
BEGIN
  SELECT * INTO s FROM realtime_settings WHERE id;
  v_sent := COALESCE((SELECT sent FROM realtime_budget WHERE day = p_day), 0);
  IF v_sent >= s.live_daily_budget * s.pause_at THEN
    RETURN 'paused';
  ELSIF v_sent >= s.live_daily_budget * s.slow_at THEN
    RETURN 'slow';
  END IF;
  RETURN 'normal';
END;
$$;

-- Called by Tutors Live (as anon) while it shows a feed: records the tab as a watcher of the topic and
-- answers with today's tier, so a paused dashboard knows to read stored activity instead.
CREATE OR REPLACE FUNCTION public.realtime_watch(p_topic text, p_watcher text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_topic IS NULL OR length(p_topic) = 0 OR length(p_topic) > 200 THEN
    RAISE EXCEPTION 'realtime_watch: topic must be 1 to 200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_watcher IS NULL OR length(p_watcher) = 0 OR length(p_watcher) > 100 THEN
    RAISE EXCEPTION 'realtime_watch: watcher must be 1 to 100 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO realtime_watchers (topic, watcher, seen_at) VALUES (p_topic, p_watcher, now())
  ON CONFLICT (topic, watcher) DO UPDATE SET seen_at = EXCLUDED.seen_at;

  RETURN jsonb_build_object('tier', live_budget_tier((now() AT TIME ZONE 'utc')::date));
END;
$$;

-- Called by the reader's server once per learning event, before it publishes. Answers with today's tier
-- and the topics to publish to, and charges their cost (1 + watchers per topic) to today's budget in the
-- same statement. The topic names mirror `topics` in @tutors/realtime: a course's topic is its bare
-- course id (topics.courseActivity) and 'tutors-all-course-access' is topics.platformActivity().
CREATE OR REPLACE FUNCTION public.realtime_claim_live_publish(p_course_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  platform_topic constant text := 'tutors-all-course-access';
  s realtime_settings%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'utc')::date;
  v_tier text;
  v_course_watchers bigint;
  v_platform_watchers bigint;
  v_topics text[] := ARRAY[]::text[];
  v_cost bigint := 0;
BEGIN
  IF p_course_id IS NULL OR length(p_course_id) = 0 OR length(p_course_id) > 200 OR p_course_id = platform_topic THEN
    RAISE EXCEPTION 'realtime_claim_live_publish: course id must be 1 to 200 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO s FROM realtime_settings WHERE id;
  DELETE FROM realtime_watchers WHERE seen_at < now() - make_interval(secs => s.watcher_ttl_seconds);

  v_tier := live_budget_tier(v_day);
  IF v_tier = 'paused' THEN
    RETURN jsonb_build_object('tier', v_tier, 'topics', '[]'::jsonb);
  END IF;

  SELECT count(*) INTO v_course_watchers FROM realtime_watchers WHERE topic = p_course_id;
  SELECT count(*) INTO v_platform_watchers FROM realtime_watchers WHERE topic = platform_topic;

  IF v_course_watchers > 0 THEN
    v_topics := v_topics || p_course_id;
    v_cost := v_cost + 1 + v_course_watchers;
  END IF;
  -- From slow_at the platform feed stops first: it carries every course's events.
  IF v_tier = 'normal' AND v_platform_watchers > 0 THEN
    v_topics := v_topics || platform_topic;
    v_cost := v_cost + 1 + v_platform_watchers;
  END IF;

  IF v_cost > 0 THEN
    INSERT INTO realtime_budget (day, sent) VALUES (v_day, v_cost)
    ON CONFLICT (day) DO UPDATE SET sent = realtime_budget.sent + EXCLUDED.sent;
  END IF;

  RETURN jsonb_build_object('tier', v_tier, 'topics', to_jsonb(v_topics));
END;
$$;

-- realtime_watch and realtime_claim_live_publish are called with the anon key (the reader's server uses
-- the same public key as the browser). Supabase grants EXECUTE on new functions to anon and
-- authenticated directly, so live_budget_tier is revoked by name as well as from PUBLIC.
REVOKE EXECUTE ON FUNCTION public.live_budget_tier(date) FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.live_budget_tier(date) FROM %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.realtime_watch(text, text) TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.realtime_claim_live_publish(text) TO %I', role_name);
    END IF;
  END LOOP;
END $$;
