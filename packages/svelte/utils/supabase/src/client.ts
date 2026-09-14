/**
 * Browser-safe Supabase client shared by every Tutors package and app.
 *
 * This is the one place the anon client is created. Packages that need
 * persistence import `supabase` (or `requireSupabase`) from here instead of
 * calling `createClient` themselves, so anon mode and configuration are
 * honoured everywhere.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_ANON_MODE, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";

/** True when the deployment runs without Supabase (PUBLIC_ANON_MODE=TRUE). */
export const isAnonMode: boolean = PUBLIC_ANON_MODE === "TRUE";

/** Connection details, for framework-free libraries that build their own client. */
export const supabaseConfig = {
  url: PUBLIC_SUPABASE_URL,
  anonKey: PUBLIC_SUPABASE_ANON_KEY
} as const;

/**
 * The shared anon-key client. Undefined in anon mode; callers that cannot
 * work without a database should use {@link requireSupabase}.
 */
export let supabase: SupabaseClient;

if (!isAnonMode) {
  supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
}

/** Whether a client is available (false in anon mode). */
export function hasSupabase(): boolean {
  return typeof supabase !== "undefined";
}

/** The shared client, or a clear error when the deployment is in anon mode. */
export function requireSupabase(): SupabaseClient {
  if (typeof supabase === "undefined") {
    throw new Error("Supabase is unavailable: PUBLIC_ANON_MODE is TRUE for this deployment");
  }
  return supabase;
}
