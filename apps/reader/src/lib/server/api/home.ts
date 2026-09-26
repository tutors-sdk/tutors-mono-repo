import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseProgress } from "@tutors/data-api";
import type { PublishedLo } from "./authorization.ts";
import { StoreError } from "./store.ts";
import { courseId as validCourseId } from "./validate.ts";

/** The most courses one home page reports on; a profile past this lists its most recent first. */
export const MAX_HOME_COURSES = 50;

export interface VisitedLo {
  course_id: string;
  lo_id: string;
  date_last_accessed: string | null;
}

/** The course ids in a profile, most recently visited first, valid and without repeats. */
export function homeCourseIds(visits: unknown[]): string[] {
  const dated = visits
    .map((v) => v as { id?: unknown; lastVisit?: unknown })
    .map((v) => ({ id: validCourseId(v?.id), at: typeof v?.lastVisit === "string" ? v.lastVisit : "" }))
    .filter((v): v is { id: string; at: string } => v.id !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
  return [...new Set(dated.map((v) => v.id))].slice(0, MAX_HOME_COURSES);
}

/** The published learning object a record counts toward: the one whose route it equals or sits beneath. */
function owner(los: PublishedLo[], loId: string): PublishedLo | undefined {
  let best: PublishedLo | undefined;
  for (const lo of los) {
    if ((loId === lo.route || loId.startsWith(lo.route + "/")) && lo.route.length > (best?.route.length ?? -1)) best = lo;
  }
  return best;
}

/** Rules 0076 and 0077: how many of the course's learning objects the records open, and where to continue. */
export function courseProgress(los: PublishedLo[], records: VisitedLo[]): CourseProgress {
  const opened = new Set<string>();
  let latest: { record: VisitedLo; lo: PublishedLo } | undefined;
  for (const record of records) {
    const lo = owner(los, record.lo_id);
    if (!lo) continue;
    opened.add(lo.route);
    if (!latest || (record.date_last_accessed ?? "") > (latest.record.date_last_accessed ?? "")) latest = { record, lo };
  }
  return {
    opened: opened.size,
    total: los.length,
    continueAt: latest ? { route: latest.record.lo_id, title: latest.lo.title } : null
  };
}

/** The signed-in student's learning records in the given courses. */
export async function learningRecordsIn(db: SupabaseClient, login: string, courseIds: string[]): Promise<VisitedLo[]> {
  if (courseIds.length === 0) return [];
  const { data, error } = await db
    .from("learning_records")
    .select("course_id, lo_id, date_last_accessed")
    .eq("student_id", login)
    .in("course_id", courseIds);
  if (error) throw new StoreError(`learning_records read: ${error.message ?? "unknown error"}`);
  return (data as VisitedLo[] | null) ?? [];
}
