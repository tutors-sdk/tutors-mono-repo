import { supabase } from "@tutors/community";
import { dataApi } from "@tutors/data-api";
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

export async function upsertLock(courseId: string, loRoute: string, locked: boolean): Promise<boolean> {
  if (!courseId || !loRoute) return false;
  const response = await dataApi.setLock({ courseId, loRoute, locked });
  if (!response?.ok) {
    log.error("upsertLock failed:", { status: response?.status ?? null });
    return false;
  }
  return true;
}

export async function removeLock(courseId: string, loRoute: string): Promise<boolean> {
  if (!courseId || !loRoute) return false;
  const response = await dataApi.removeLock({ courseId, loRoute });
  if (!response?.ok) {
    log.error("removeLock failed:", { status: response?.status ?? null });
    return false;
  }
  return true;
}
