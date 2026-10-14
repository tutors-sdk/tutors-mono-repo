/**
 * Tutors Time's composition root: the Supabase store for the error transport and health check,
 * and the time library's own client for its analytics reads. Moodle is composed on the server
 * (lib/server/api/moodle.ts) from private environment.
 */
import { configureSupabase, createSupabaseClient } from "@tutors/store-supabase";
import { initSupabase } from "@tutors/tutors-time-lib";
import log, { withRequestId } from "@tutors/logger";

export type TimeEnv = { PUBLIC_ANON_MODE?: string; PUBLIC_SUPABASE_URL?: string; PUBLIC_SUPABASE_ANON_KEY?: string };

export function composeTime(env: TimeEnv): void {
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_ANON_KEY;
  const client = env.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE" ? undefined : createSupabaseClient(url, key, withRequestId());
  configureSupabase(client, client ? { url: url!, key: key! } : undefined);
  initSupabase(url ?? "", key ?? "");
  if (!client && env.PUBLIC_ANON_MODE?.trim().toUpperCase() !== "TRUE") {
    log.warn("Supabase is not configured (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing); running without it");
  }
}
