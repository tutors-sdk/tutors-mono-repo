/**
 * Writes Moodle assignments and submissions into the Supabase tables Tutors Time reads (assignments,
 * assignments_submissions). Uses the server-only service client, so only the educator-checked
 * moodle-sync route (Rules 0633-0634) may call it.
 */
import { now } from "@tutors/runtime";
import type { MoodleAssignSubmission, MoodleModule } from "#lib/server/moodle/moodle-client.ts";
import { serviceSupabase } from "#lib/server/supabase-service.ts";

export interface AssignmentRow {
  courseid: string;
  id: number;
  name: string | null;
  url: string | null;
  due_date: string | null;
  opened_date: string | null;
  last_synced_at: string;
}

function toTimestamp(unix: number | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

function toAssignmentRow(module: MoodleModule, courseId: string): AssignmentRow {
  const dueDate = module.dates?.find((d) => d.dataid === "duedate");
  const openedDate = module.dates?.find((d) => d.dataid === "allowsubmissionsfromdate");

  return {
    courseid: courseId,
    id: module.instance as number,
    name: module.name ?? null,
    url: module.url ?? null,
    due_date: toTimestamp(dueDate?.timestamp),
    opened_date: toTimestamp(openedDate?.timestamp),
    last_synced_at: now().toISOString()
  };
}

export async function upsertAssignments(modules: MoodleModule[], courseId: string): Promise<void> {
  const rows = modules.filter((mod) => mod.instance !== undefined).map((mod) => toAssignmentRow(mod, courseId));

  if (rows.length === 0) return;

  const { error } = await getClient().from("assignments").upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to upsert assignments for course ${courseId}: ${error.message}`);
  }
}

export interface SubmissionRow {
  id: number;
  assignmentId: number;
  external_userid: number;
  attempt_no: number;
  status: string;
  timecreated: string | null;
  timemodified: string | null;
  timestarted: string | null;
  grading_status: string;
  last_synced_at: string;
}

function toSubmissionRow(submission: MoodleAssignSubmission, assignmentId: number, module: MoodleModule | undefined): SubmissionRow {
  return {
    id: submission.id,
    assignmentId: assignmentId,
    external_userid: submission.userid,
    attempt_no: submission.attemptnumber ?? 0,
    status: submission.status ?? "",
    timecreated: toTimestamp(submission?.timecreated),
    timemodified: toTimestamp(submission?.timemodified),
    timestarted: toTimestamp(submission?.timestarted),
    grading_status: submission.gradingstatus ?? "",
    last_synced_at: now().toISOString()
  };
}

function getClient() {
  const db = serviceSupabase();
  if (!db) throw new Error("PRIVATE_SUPABASE_SERVICE_ROLE_KEY is not configured");
  return db;
}

/**
 * The sync scope a completion is recorded under: the Moodle course, narrowed to one section when the
 * educator synced a section, so a section sync never stands in for the whole course.
 */
export function syncScope(moodleCourseId: number, moodleSectionId?: number): string {
  return moodleSectionId === undefined ? String(moodleCourseId) : `${moodleCourseId}/${moodleSectionId}`;
}

/**
 * When the last sync of this course and scope completed, from moodle_syncs. The rows' own last_synced_at
 * columns are not used: they are written part way through a sync that may still fail.
 */
export async function getLastCompletedSync(courseId: string, scope: string): Promise<string | null> {
  const { data, error } = await getClient().from("moodle_syncs").select("synced_at").eq("courseid", courseId).eq("scope", scope).maybeSingle();

  if (error || !data) return null;
  return data.synced_at;
}

/** Records a completed sync. Called only after every assignment and submission write has succeeded. */
export async function recordCompletedSync(courseId: string, scope: string): Promise<void> {
  const { error } = await getClient().from("moodle_syncs").upsert({ courseid: courseId, scope, synced_at: now().toISOString() }, { onConflict: "courseid,scope" });

  if (error) {
    throw new Error(`Failed to record the Moodle sync of course ${courseId}: ${error.message}`);
  }
}

export async function upsertSubmissions(submissions: MoodleAssignSubmission[], assignmentId: number, module: MoodleModule | undefined): Promise<void> {
  if (submissions.length === 0) return;

  const rows = submissions.map((s) => toSubmissionRow(s, assignmentId, module));
  const { error } = await getClient().from("assignments_submissions").upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to upsert submissions for assignment ${assignmentId}: ${error.message}`);
  }
}
