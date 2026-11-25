import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentSummary, TimeRows, TimeUserRow } from "@tutors/domain/learning";
import { StoreError } from "./learner-store.ts";

/** A course's stored learning activity, read whole with the service client for the time views. */
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const PAGE = 1000;
const MAX_ROWS = 200_000;

async function selectAll<T>(what: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new StoreError(`${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function readUsers(db: SupabaseClient, ids: string[]): Promise<TimeUserRow[]> {
  const users: TimeUserRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("tutors-connect-users")
      .select("github_id, full_name, avatar_url, online_status, sentiment, date_last_accessed")
      .in("github_id", ids.slice(i, i + 200));
    if (error) throw new StoreError(`tutors-connect-users read: ${error.message}`);
    users.push(...((data ?? []) as TimeUserRow[]));
  }
  return users;
}

async function readAssignments(db: SupabaseClient, courseId: string): Promise<AssignmentSummary[]> {
  const { data, error } = await db.from("assignments").select("id, name, url, due_date, opened_date").eq("courseid", courseId);
  if (error || !data?.length) return [];
  const assignments = data as Omit<AssignmentSummary, "submissionCount">[];
  const submissions = await selectAll<{ assignmentId: number }>("assignments_submissions read", (from, to) =>
    db.from("assignments_submissions").select("assignmentId").in("assignmentId", assignments.map((a) => a.id)).range(from, to)
  );
  const counts = new Map<number, number>();
  for (const s of submissions) counts.set(s.assignmentId, (counts.get(s.assignmentId) ?? 0) + 1);
  return assignments.map((a) => ({ ...a, submissionCount: counts.get(a.id) ?? 0 }));
}

export async function readTimeRows(db: SupabaseClient, courseId: string, startDate?: string | null, endDate?: string | null): Promise<TimeRows> {
  const [courseResult, calendar, learningRecords, assignments] = await Promise.all([
    db.from("tutors-connect-courses").select("course_id, course_record").eq("course_id", courseId).maybeSingle(),
    selectAll<Record<string, unknown>>("calendar read", (from, to) => {
      let query = db.from("calendar").select("*").eq("courseid", courseId).order("id", { ascending: true });
      if (startDate) query = query.gte("id", startDate);
      if (endDate) query = query.lte("id", endDate);
      return query.range(from, to);
    }),
    selectAll<Record<string, unknown>>("learning_records read", (from, to) =>
      db.from("learning_records").select("*").eq("course_id", courseId).order("date_last_accessed", { ascending: false }).range(from, to)
    ),
    readAssignments(db, courseId)
  ]);
  if (courseResult.error) throw new StoreError(`tutors-connect-courses read: ${courseResult.error.message}`);

  const ids = new Set<string>();
  for (const r of calendar) if (typeof r.studentid === "string" && r.studentid) ids.add(r.studentid);
  for (const r of learningRecords) if (typeof r.student_id === "string" && r.student_id) ids.add(r.student_id);

  return {
    courseId,
    role: "educator",
    course: (courseResult.data as TimeRows["course"]) ?? null,
    calendar,
    learningRecords,
    users: await readUsers(db, [...ids]),
    assignments
  };
}
