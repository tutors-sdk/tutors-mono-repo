/**
 * The Supabase store adapter, browser side: what any visitor may read with the public key (the
 * catalogue, a course's content locks, the latest presence snapshots), the error transport and the
 * health check. Nothing here writes a learner's data: those writes go through the reader's data API
 * (`@tutors/data-api`). @supabase/supabase-js is imported in this package and in the realtime
 * adapter, nowhere else.
 */
export { supabase, createSupabaseClient, configureSupabase, supabaseConfig, type SupabaseConfig, type SupabaseClientSettings } from "./client.ts";
export * from "./presence-rows.ts";
export * from "./access-store.ts";
export * from "./catalogue.ts";
export { createSupabaseErrorTransport } from "./error-transport.ts";
export { checkSupabase, getRecentErrorCounts, HEALTH_CHECK_TIMEOUT_MS } from "./health-check.ts";
