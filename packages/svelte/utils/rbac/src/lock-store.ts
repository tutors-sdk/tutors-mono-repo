import { supabase } from "@tutors/community/utils/supabase-client";
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

/**
 * Ask the reader's server to lock or unlock one learning object (PUT /api/courses/:id/locks, Rule 0630).
 * The server checks the signed-in educator and records who made the change; the browser never writes
 * the table itself. Resolves false when the server refuses or cannot be reached.
 */
export async function upsertLock(courseId: string, loRoute: string, locked: boolean): Promise<boolean> {
  if (!courseId || !loRoute) return false;
  try {
    const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/locks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loRoute, locked })
    });
    if (!response.ok) log.warn("upsertLock refused", { courseId, loRoute, status: response.status });
    return response.ok;
  } catch (error) {
    log.error("upsertLock failed:", error);
    return false;
  }
}
