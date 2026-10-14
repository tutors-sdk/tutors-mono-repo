/**
 * The Supabase store adapter: every table Tutors reads and writes, behind the application's
 * ports (LearningEventSink, LearningRecords, ProfilePort, AccessStore) plus the catalogue, the
 * error transport and the health check the apps use directly. @supabase/supabase-js is imported
 * here and in the realtime adapter, nowhere else.
 */
export { supabase, createSupabaseClient, configureSupabase, supabaseConfig, type SupabaseConfig } from "./client.ts";
export * from "./learning-events.ts";
export * from "./learning-records.ts";
export * from "./presence-rows.ts";
export * from "./profile.ts";
export * from "./access-store.ts";
export * from "./catalogue.ts";
export * from "./course-catalogue.ts";
export { createSupabaseErrorTransport } from "./error-transport.ts";
export { checkSupabase, getRecentErrorCounts } from "./health-check.ts";
