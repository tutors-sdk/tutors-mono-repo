import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "$env/static/public";
import { createClient } from "@supabase/supabase-js";
import type { MoodleAssignSubmission, MoodleModule } from "$lib/server/api/moodle";

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
    last_synced_at: new Date().toISOString()
  };
}

export async function upsertAssignments(
  modules: MoodleModule[],
  courseId: string
): Promise<void> {
  const rows = modules
    .filter((mod) => mod.instance !== undefined)
    .map((mod) => toAssignmentRow(mod, courseId));

  if (rows.length === 0) return;

  const { error } = await getClient()
    .from("assignments")
    .upsert(rows, { onConflict: "id" });

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

function toSubmissionRow(
  submission: MoodleAssignSubmission,
  assignmentId: number,
  module: MoodleModule | undefined
): SubmissionRow {
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
    last_synced_at: new Date().toISOString()
  };
}

function getClient() {
  return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
}

export async function getLastSyncedAt(courseId: string): Promise<string | null> {
  const { data, error } = await getClient()
    .from("assignments")
    .select("last_synced_at")
    .eq("courseid", courseId)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.last_synced_at;
}

export async function upsertSubmissions(
  submissions: MoodleAssignSubmission[],
  assignmentId: number,
  module: MoodleModule | undefined
): Promise<void> {
  if (submissions.length === 0) return;

  const rows = submissions.map((s) => toSubmissionRow(s, assignmentId, module));
  const { error } = await getClient()
    .from("assignments_submissions")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to upsert submissions for assignment ${assignmentId}: ${error.message}`);
  }
}
