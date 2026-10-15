import * as env from "$app/env/public";
import { createRealtimeGateway, offlineAdapter } from "@tutors/realtime";
import { supabaseRealtimeAdapter } from "@tutors/realtime-supabase";
import log from "@tutors/logger";
import { supabase } from "../utils/supabase-client.ts";

/**
 * This tab's one Realtime gateway. Presence and Tutors Live reach Realtime only through it, so the
 * budget, the jittered rejoin and the counts cover every channel the tab opens.
 */
export const realtime = createRealtimeGateway({
  adapter: env.PUBLIC_ANON_MODE !== "TRUE" && supabase ? supabaseRealtimeAdapter(supabase) : offlineAdapter,
  onError: (failure, topic, error) => {
    if (failure === "send") log.error("Realtime broadcast failed:", topic, error);
    else log.error("Leaving a Realtime channel failed:", topic, error);
  }
});
