/**
 * The server side of the Supabase adapter: everything that reads or writes a learner's rows with
 * the service-role key. Only an app's server code imports this entry (never a browser bundle); the
 * app builds the client from its private environment, decides who is asking, and then calls in.
 */
export * from "./learner-store.ts";
export { readTimeRows } from "./time-rows.ts";
export { getLastSyncedAt, upsertAssignments, upsertSubmissions } from "./moodle-submissions.ts";
export { courseVisitorLogins, fullNamesOf } from "./enrolment.ts";
export { createServiceClient, type ServiceDb } from "./service-client.ts";
export { useServerClock } from "./clock.ts";
