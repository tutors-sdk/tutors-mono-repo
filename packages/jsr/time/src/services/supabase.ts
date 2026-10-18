import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let configuredUrl: string | null = null;
let configuredKey: string | null = null;
let client: SupabaseClient | null = null;

/**
 * Initialise Supabase keys. Must be called before any getSupabase() or service that uses it.
 * Typically called once at app startup (e.g. in root layout).
 */
export function initSupabase(url: string, anonKey: string): void {
  if (url !== configuredUrl || anonKey !== configuredKey) client = null;
  configuredUrl = url;
  configuredKey = anonKey;
}
/**
 * Returns the Supabase client for the configured url and key, created on first use and reused after:
 * each new client is another GoTrueClient on the same storage key, and concurrent ones contend for its lock.
 * Requires initSupabase(url, anonKey) to have been called first.
 * If the app set __TUTORS_TIME_SUPABASE_INIT__ (e.g. in hooks.client.ts), uses that as fallback.
 */
export function getSupabase(): SupabaseClient {
  if (!configuredUrl || !configuredKey) {
    throw new Error(
      "Supabase not initialised. Call initSupabase(url, anonKey) before using the tutors-time-service."
    );
  }
  client ??= createClient(configuredUrl, configuredKey);
  return client;
}
