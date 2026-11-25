/**
 * Tutors Time's composition root: the Supabase store for the error transport and health check.
 * Its analytics are read from the reader's authenticated API (lib/time-source.ts), which the
 * browser hooks install as the time library's source.
 */
import { configureSupabase, createSupabaseClient } from "@tutors/store-supabase";
import log, { withRequestId, withTimeout } from "@tutors/logger";

export type TimeEnv = { PUBLIC_ANON_MODE?: string; PUBLIC_SUPABASE_URL?: string; PUBLIC_SUPABASE_ANON_KEY?: string };

export function composeTime(env: TimeEnv): void {
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_ANON_KEY;
  const client = env.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE" ? undefined : createSupabaseClient(url, key, { fetch: withTimeout(withRequestId()) });
  configureSupabase(client, client ? { url: url!, key: key! } : undefined);
  if (!client && env.PUBLIC_ANON_MODE?.trim().toUpperCase() !== "TRUE") {
    log.warn("Supabase is not configured (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing or not a URL); running without it");
  }
}
