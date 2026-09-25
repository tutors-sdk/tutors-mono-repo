import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import log, { withRequestId } from "@tutors/logger";

let client: SupabaseClient | null | undefined;

export function serviceClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = publicEnv.PUBLIC_SUPABASE_URL?.trim();
  const key = env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || publicEnv.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE") {
    log.warn("Server-side Supabase is not configured (PUBLIC_SUPABASE_URL / PRIVATE_SUPABASE_SERVICE_ROLE_KEY missing); /api routes answer 503");
    client = null;
    return client;
  }
  if (key === publicEnv.PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    log.error("PRIVATE_SUPABASE_SERVICE_ROLE_KEY is the anon key; /api routes answer 503 until the service_role key is set");
    client = null;
    return client;
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: withRequestId() }
  });
  return client;
}
