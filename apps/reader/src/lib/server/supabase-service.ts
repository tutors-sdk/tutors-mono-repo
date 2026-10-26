/**
 * Server-only Supabase client for writes the anon key must not be able to make (content locks, Rule 0630).
 * Built from PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_ROLE_KEY, which bypasses row-level security,
 * so every caller must check the actor first (requireEducator). Null when either is unset; routes answer 503.
 * Never import this from code that reaches the browser.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as publicEnv from "$app/env/public";
import * as env from "$app/env/private";
import { withRequestId, withTimeout } from "@tutors/logger";

let client: SupabaseClient | null | undefined;

export function serviceSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = publicEnv.PUBLIC_SUPABASE_URL;
  const key = env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: withTimeout(withRequestId()) } }) : null;
  return client;
}
