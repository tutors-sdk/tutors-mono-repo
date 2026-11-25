/**
 * Content locks in `tutors_content_locks`, read with the public client: every visitor's browser
 * reads the locks of the course it shows. Without Supabase, or on a query error (logged), a course
 * has no locks. Writes never come from here: a lock change goes to the reader's server (Rule 0630,
 * `@tutors/data-api`), which checks the educator and writes with the service role (`./server`).
 */
import type { ContentLock } from "@tutors/domain/access";
import type { CourseId } from "@tutors/domain/course/address";
import type { AccessStore } from "@tutors/application/ports";
import log from "@tutors/logger";
import { supabase } from "./client.ts";

type LockRow = { course_id: string; lo_route: string; locked: boolean; locked_by: string; locked_at?: string };

export async function getLocksForCourse(courseId: CourseId): Promise<ContentLock[]> {
  if (!supabase) return [];
  if (!courseId) return [];

  const { data, error } = await supabase
    .from("tutors_content_locks")
    .select("id, course_id, lo_route, locked, locked_by, locked_at")
    .eq("course_id", courseId);

  if (error) {
    log.error("getLocksForCourse failed:", error);
    return [];
  }

  return ((data ?? []) as LockRow[]).map((row) => ({
    // The rows were asked for by this id.
    courseId,
    route: row.lo_route,
    locked: row.locked,
    lockedBy: row.locked_by,
    ...(row.locked_at ? { lockedAt: row.locked_at } : {})
  }));
}

/** The reading half of the application's AccessStore; the composition root pairs it with the data API's writer. */
export function supabaseLockReader(): Pick<AccessStore, "locks"> {
  return { locks: getLocksForCourse };
}
