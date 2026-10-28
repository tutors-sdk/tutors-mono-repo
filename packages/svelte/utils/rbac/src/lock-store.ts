/**
 * The tutors_content_locks table (content locks set by educators), for rbac-service.svelte.ts. Reads go
 * through the public Supabase client; without Supabase, or on a query error (logged), it returns no locks.
 * Writes never touch the table from the browser: upsertLock asks the reader's server (Rule 0630), which
 * checks the educator and reports the change as saved, refused or unavailable.
 */
import { supabase } from "@tutors/community/utils/supabase-client";
import log from "@tutors/logger";
import { dataApi } from "@tutors/data-api";
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

/** What happened to a lock change: saved by the server, refused by it, or no server store to save it in. */
type LockWriteResult = "saved" | "refused" | "unavailable";

/**
 * Ask the reader's server to lock or unlock one learning object (PUT /api/courses/:id/locks, Rule 0630).
 * The server checks the signed-in educator and records who made the change; the browser never writes
 * the table itself. "refused" when the server rejects the change or cannot save it (4xx, 502);
 * "unavailable" when it has no database to save to (503) or cannot be reached, so the browser's
 * localStorage copy stays the record, as it does in a reader without Supabase.
 */
export async function upsertLock(courseId: string, loRoute: string, locked: boolean): Promise<LockWriteResult> {
  if (!courseId || !loRoute) return "refused";
  const response = await dataApi.setLock({ courseId, loRoute, locked });
  if (response?.ok) return "saved";
  if (!response) return "unavailable";
  log.warn("upsertLock not saved", { courseId, loRoute, status: response.status });
  return response.status === 503 ? "unavailable" : "refused";
}
