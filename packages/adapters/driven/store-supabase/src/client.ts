import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The one Supabase client this adapter uses. It is created by the composition root, which
 * decides from the environment whether there is a Supabase at all (there is none in anonymous
 * mode, or when no URL and key are configured, including the SvelteKit build step). Until then,
 * and in those cases, every function here degrades to "no Supabase" instead of throwing.
 */
export let supabase: SupabaseClient | undefined;

export type SupabaseConfig = { url: string; key: string };
let config: SupabaseConfig | undefined;

/** A client for `url` and `key`, or undefined when either is missing. `fetch` lets a server wrap requests (request ids). */
export function createSupabaseClient(url: string | undefined, key: string | undefined, fetchFn?: typeof fetch): SupabaseClient | undefined {
  if (!url || !key) return undefined;
  return createClient(url, key, fetchFn ? { global: { fetch: fetchFn } } : undefined);
}

/** Install the client (and the URL and key, for the one request that must bypass it) for every function in this adapter. */
export function configureSupabase(client: SupabaseClient | undefined, settings?: SupabaseConfig): void {
  supabase = client;
  config = client ? settings : undefined;
}

export function supabaseConfig(): SupabaseConfig | undefined {
  return config;
}
