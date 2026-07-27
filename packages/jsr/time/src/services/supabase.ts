import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let configuredUrl: string | null = null;
let configuredKey: string | null = null;

/**
 * Initialise Supabase keys. Must be called before any getSupabase() or service that uses it.
 * Typically called once at app startup (e.g. in root layout).
 */
export function initSupabase(url: string, anonKey: string): void {
  configuredUrl = url;
  configuredKey = anonKey;
}
/**
 * Returns a Supabase client. Requires initSupabase(url, anonKey) to have been called first.
 * If the app set __TUTORS_TIME_SUPABASE_INIT__ (e.g. in hooks.client.ts), uses that as fallback.
 */
export function getSupabase(): SupabaseClient {
  if (!configuredUrl || !configuredKey) {
    throw new Error(
      "Supabase not initialised. Call initSupabase(url, anonKey) before using the tutors-time-service."
    );
  }
  return createClient(configuredUrl, configuredKey);
}
