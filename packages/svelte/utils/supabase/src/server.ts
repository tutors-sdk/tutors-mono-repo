/**
 * Server-only Supabase helpers.
 *
 * Import from "@tutors/supabase/server" inside +server.ts routes, hooks and
 * $lib/server modules only. A service-role client bypasses row-level
 * security, so the key must never reach the browser bundle.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a service-role client for privileged server work (cleanup jobs,
 * educator lookups, minting tokens). Sessions are never persisted.
 *
 * @param url - Supabase project URL
 * @param serviceKey - service-role key from the private environment
 */
export function createServiceClient(url: string, serviceKey: string): SupabaseClient {
  if (!url || !serviceKey) {
    throw new Error("createServiceClient needs both the Supabase URL and a service-role key");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
