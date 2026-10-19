/**
 * Reads and writes the tutors_content_locks table (content locks set by educators), called by
 * rbac-service.svelte.ts. Uses the public Supabase client and checks no role itself; the policies in
 * sql/002_content_locks.sql allow any caller to insert, update or delete. Without Supabase it returns
 * no locks; query errors are logged and reported as an empty list or false.
 */
import { supabase } from "@tutors/community";
import log from "@tutors/logger";
import type { ContentLock } from "./types.ts";

export async function getLocksForCourse(courseId: string): Promise<ContentLock[]> {
  if (typeof supabase === "undefined") return [];
  if (!courseId) return [];

  const { data, error } = await supabase
    .from("tutors_content_locks")
    .select("id, course_id, lo_route, locked, locked_by, locked_at")
    .eq("course_id", courseId);

  if (error) {
    log.error("getLocksForCourse failed:", error);
    return [];
  }

  return (data ?? []) as ContentLock[];
}

export async function upsertLock(
  courseId: string,
  loRoute: string,
  locked: boolean,
  lockedBy: string
): Promise<boolean> {
  if (typeof supabase === "undefined") return false;
  if (!courseId || !loRoute || !lockedBy) return false;

  const { error } = await supabase.from("tutors_content_locks").upsert(
    {
      course_id: courseId,
      lo_route: loRoute,
      locked,
      locked_by: lockedBy,
      locked_at: new Date().toISOString()
    },
    { onConflict: "course_id,lo_route" }
  );

  if (error) {
    log.error("upsertLock failed:", error);
    return false;
  }

  return true;
}

export async function removeLock(courseId: string, loRoute: string): Promise<boolean> {
  if (typeof supabase === "undefined") return false;
  if (!courseId || !loRoute) return false;

  const { error } = await supabase
    .from("tutors_content_locks")
    .delete()
    .eq("course_id", courseId)
    .eq("lo_route", loRoute);

  if (error) {
    log.error("removeLock failed:", error);
    return false;
  }

  return true;
}
