/** The catalogue's composition root: the Supabase store the catalogue is read from, or nothing. */
import { configureSupabase, createSupabaseClient } from "@tutors/store-supabase";
import log, { withRequestId } from "@tutors/logger";

export type CatalogueEnv = { PUBLIC_ANON_MODE?: string; PUBLIC_SUPABASE_URL?: string; PUBLIC_SUPABASE_ANON_KEY?: string };

export function composeCatalogue(env: CatalogueEnv): void {
  const url = env.PUBLIC_SUPABASE_URL;
  const key = env.PUBLIC_SUPABASE_ANON_KEY;
  const client = env.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE" ? undefined : createSupabaseClient(url, key, withRequestId());
  configureSupabase(client, client ? { url: url!, key: key! } : undefined);
  if (!client && env.PUBLIC_ANON_MODE?.trim().toUpperCase() !== "TRUE") {
    log.warn("Supabase is not configured (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing); running without it");
  }
}
