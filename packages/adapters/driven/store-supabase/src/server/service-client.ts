import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** The server's database handle: a Supabase client holding the service-role key. */
export type ServiceDb = SupabaseClient;

/**
 * A client for the service-role key, which bypasses row-level security: only server code builds
 * one, and every caller decides who is asking before it writes. No session is kept or refreshed.
 */
export function createServiceClient(url: string, key: string, settings: { fetch?: typeof fetch } = {}): ServiceDb {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(settings.fetch ? { global: { fetch: settings.fetch } } : {})
  });
}
