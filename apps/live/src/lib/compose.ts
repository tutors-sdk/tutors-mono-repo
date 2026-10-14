/**
 * Tutors Live's composition root: presence over Supabase Realtime, or nothing in anonymous mode.
 * Live only listens; it records no learner and has no sign-in.
 */
import { anonymousAdapters, type Adapters } from "@tutors/svelte-state/adapters";
import { clock } from "@tutors/clock";
import { configureSupabase, createSupabaseClient } from "@tutors/store-supabase";
import { supabasePresence } from "@tutors/realtime-supabase";
import log, { withRequestId } from "@tutors/logger";

export type LiveEnv = { PUBLIC_ANON_MODE?: string; PUBLIC_SUPABASE_URL?: string; PUBLIC_SUPABASE_ANON_KEY?: string };

export function composeLive(env: LiveEnv): Adapters {
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_ANON_KEY;
  const client = env.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE" ? undefined : createSupabaseClient(url, key, withRequestId());
  configureSupabase(client, client ? { url: url!, key: key! } : undefined);
  if (!client) {
    if (env.PUBLIC_ANON_MODE?.trim().toUpperCase() !== "TRUE") log.warn("Supabase is not configured (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing); running without it");
    return anonymousAdapters({ clock });
  }
  return { ...anonymousAdapters({ clock }), anonymous: false, presence: supabasePresence(client, clock.now) };
}
