/**
 * The Moodle sync's store, composed: the Supabase adapter's assignment and submission writes over
 * this server's service client, so only the educator-checked moodle-sync route (Rules 0633-0634)
 * reaches them.
 */
import type { MoodleAssignSubmission, MoodleModule } from "#lib/server/moodle/moodle-client.ts";
import { serviceSupabase } from "#lib/server/supabase-service.ts";
import * as store from "@tutors/store-supabase/server";

function db() {
  const client = serviceSupabase();
  if (!client) throw new Error("PRIVATE_SUPABASE_SERVICE_ROLE_KEY is not configured");
  return client;
}

export const upsertAssignments = (modules: MoodleModule[], courseId: string) => store.upsertAssignments(db(), modules, courseId);
export const getLastSyncedAt = (courseId: string) => store.getLastSyncedAt(db(), courseId);
export const upsertSubmissions = (submissions: MoodleAssignSubmission[], assignmentId: number, module: MoodleModule | undefined) =>
  store.upsertSubmissions(db(), submissions, assignmentId, module);
