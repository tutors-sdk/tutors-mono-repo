/**
 * The latest presence snapshot per learner per course (`tutors-connect-latest`), as the live
 * app reads it. The reader's own roster reads go through the realtime adapter's PresencePort.
 */
import type { TutorsConnectLatestRow } from "@tutors/domain/learning";
import log from "@tutors/logger";
import { supabase } from "./client.ts";

/**
 * Upsert latest Lo snapshot for (course, student) into tutors-connect-latest.
 * Fire-and-forget from presence; does not throw.
 */
export async function upsertTutorsConnectLatestLo(loRecord: object): Promise<void> {
  if (!supabase) return;

  const rec = loRecord as { courseId?: string; user?: { id?: string } };
  const courseId = rec.courseId?.trim();
  const studentId = rec.user?.id?.trim();
  if (!courseId || !studentId) return;

  const { error } = await supabase.from("tutors-connect-latest").upsert(
    {
      course_id: courseId,
      student_id: studentId,
      payload: loRecord,
      received_at: new Date().toISOString()
    },
    { onConflict: "course_id,student_id" }
  );

  if (error) {
    log.error("upsertTutorsConnectLatestLo failed:", error);
  }
}

/**
 * All stored Lo snapshots for a course (one row per student, already “latest” by key).
 * Sorted by `received_at` descending (most recently updated first).
 */
export async function getTutorsConnectLatestLosByCourseId(courseId: string): Promise<TutorsConnectLatestRow[]> {
  if (!supabase) return [];

  const id = courseId?.trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from("tutors-connect-latest")
    .select("course_id, student_id, payload, received_at")
    .eq("course_id", id)
    .order("received_at", { ascending: false });

  if (error) {
    log.error("getTutorsConnectLatestLosByCourseId failed:", error);
    return [];
  }

  return (data ?? []) as TutorsConnectLatestRow[];
}

/**
 * Stored Lo snapshots for a course received at or after `sinceIso`: the students active recently.
 * Sorted by `received_at` descending (most recently updated first).
 * @returns null when the read fails, so a caller can tell a failure from a course nobody is in
 */
export async function getTutorsConnectRecentLosByCourseId(courseId: string, sinceIso: string): Promise<TutorsConnectLatestRow[] | null> {
  if (!supabase) return [];

  const id = courseId?.trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from("tutors-connect-latest")
    .select("course_id, student_id, payload, received_at")
    .eq("course_id", id)
    .gte("received_at", sinceIso)
    .order("received_at", { ascending: false });

  if (error) {
    log.error("getTutorsConnectRecentLosByCourseId failed:", error);
    return null;
  }

  return (data ?? []) as TutorsConnectLatestRow[];
}
