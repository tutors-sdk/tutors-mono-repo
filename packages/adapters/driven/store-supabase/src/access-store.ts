/** Content locks in `tutors_content_locks`; `supabaseAccessStore` is the application's AccessStore over them. */
import type { ContentLock } from "@tutors/domain/access";
import type { AccessStore } from "@tutors/application/ports";
import log from "@tutors/logger";
import { supabase } from "./client.ts";

export async function getLocksForCourse(courseId: string): Promise<ContentLock[]> {
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

  return (data ?? []) as ContentLock[];
}

export async function upsertLock(
  courseId: string,
  loRoute: string,
  locked: boolean,
  lockedBy: string
): Promise<boolean> {
  if (!supabase) return false;
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
  if (!supabase) return false;
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

export function supabaseAccessStore(): AccessStore {
  return { locks: getLocksForCourse, setLock: upsertLock, removeLock };
}
