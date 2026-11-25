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

/** What the root may set on the client: a wrapped fetch (request ids, a deadline) and the Realtime budget's options. */
export type SupabaseClientSettings = { fetch?: typeof fetch; realtime?: Record<string, unknown> };

/** Whether `url` is an http(s) URL, which is all the Supabase client accepts. */
function isHttpUrl(url: string): boolean {
  try {
    return /^https?:$/.test(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * A client for `url` and `key`, or undefined when either is missing, blank, or the URL is not an
 * http(s) URL. A composition root runs while its app's modules load, so a bad value must leave the
 * app running without Supabase (its start-up check and /healthz name the variable) rather than
 * stop it from starting.
 */
export function createSupabaseClient(url: string | undefined, key: string | undefined, settings: SupabaseClientSettings = {}): SupabaseClient | undefined {
  const address = url?.trim();
  const secret = key?.trim();
  if (!address || !secret || !isHttpUrl(address)) return undefined;
  return createClient(address, secret, {
    ...(settings.fetch ? { global: { fetch: settings.fetch } } : {}),
    ...(settings.realtime ? { realtime: settings.realtime } : {})
  });
}

/** Install the client (and the URL and key, for the one request that must bypass it) for every function in this adapter. */
export function configureSupabase(client: SupabaseClient | undefined, settings?: SupabaseConfig): void {
  supabase = client;
  config = client ? settings : undefined;
}

export function supabaseConfig(): SupabaseConfig | undefined {
  return config;
}
