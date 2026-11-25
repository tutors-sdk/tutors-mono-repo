/**
 * Tutors Live's composition root: presence watched over Supabase Realtime and its stored snapshots,
 * or nothing in anonymous mode. Live only watches; it records no learner, publishes nothing and has
 * no sign-in.
 */
import { anonymousAdapters, type Adapters } from "@tutors/svelte-state/adapters";
import { clock } from "@tutors/clock";
import { configureSupabase, createSupabaseClient } from "@tutors/store-supabase";
import { realtimeClientOptions, supabasePresence } from "@tutors/realtime-supabase";
import log, { withRequestId, withTimeout } from "@tutors/logger";

export type LiveEnv = { PUBLIC_ANON_MODE?: string; PUBLIC_SUPABASE_URL?: string; PUBLIC_SUPABASE_ANON_KEY?: string };

export function composeLive(env: LiveEnv): Adapters {
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_ANON_KEY;
  const anonymous = env.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE";
  const client = anonymous ? undefined : createSupabaseClient(url, key, { fetch: withTimeout(withRequestId()), realtime: realtimeClientOptions() });
  configureSupabase(client, client ? { url: url!, key: key! } : undefined);
  if (!client) {
    if (!anonymous) log.warn("Supabase is not configured (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing or not a URL); running without it");
    return anonymousAdapters({ clock });
  }
  // Live watches and never publishes: the reader's server is the only publisher.
  return { ...anonymousAdapters({ clock }), anonymous: false, presence: { ...supabasePresence(client), publish: async () => {} } };
}
