import type { TutorsConnectCourse, TutorsConnectUser } from "../types/index.ts";
import { getSupabase } from "./supabase.ts";

export interface TutorsTimeRows {
  courseId: string;
  role: "educator" | "student";
  course: Pick<TutorsConnectCourse, "course_id" | "course_record"> | null;
  calendar: Record<string, unknown>[];
  learningRecords: Record<string, unknown>[];
  users: Omit<TutorsConnectUser, "email">[];
  assignments: { id: number; name: string | null; url: string | null; due_date: string | null; opened_date: string | null; submissionCount: number }[];
}

export interface TutorsTimeSource {
  courseRows(courseId: string): Promise<TutorsTimeRows>;
  courseRecord(courseId: string): Promise<Pick<TutorsConnectCourse, "course_id" | "course_record"> | null>;
  user(studentId: string, courseId?: string): Promise<Omit<TutorsConnectUser, "email"> | null>;
}

export class TutorsTimeSourceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "TutorsTimeSourceError";
  }
}

const USER_COLUMNS = "github_id, full_name, avatar_url, online_status, sentiment, date_last_accessed";

async function selectAll(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, what: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(`Failed to fetch ${what}: ${error.message}`);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) return rows;
  }
}

export function supabaseTimeSource(): TutorsTimeSource {
  return {
    async courseRows(courseId) {
      const db = getSupabase();
      const [calendar, learningRecords, course] = await Promise.all([
        selectAll((from, to) => db.from("calendar").select("*").eq("courseid", courseId).order("id", { ascending: true }).range(from, to), "calendar data"),
        selectAll((from, to) => db.from("learning_records").select("*").eq("course_id", courseId).order("date_last_accessed", { ascending: false }).range(from, to), "learning records"),
        this.courseRecord(courseId)
      ]);
      const ids = [...new Set([...calendar.map((r) => r.studentid), ...learningRecords.map((r) => r.student_id)].filter((v): v is string => typeof v === "string" && !!v))];
      const users: TutorsTimeRows["users"] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await db.from("tutors-connect-users").select(USER_COLUMNS).in("github_id", ids.slice(i, i + 200));
        users.push(...((data ?? []) as TutorsTimeRows["users"]));
      }
      return { courseId, role: "educator", course, calendar, learningRecords, users, assignments: [] };
    },
    async courseRecord(courseId) {
      const { data, error } = await getSupabase().from("tutors-connect-courses").select("course_id, course_record").eq("course_id", courseId).maybeSingle();
      return error || !data ? null : (data as TutorsTimeRows["course"]);
    },
    async user(studentId) {
      const { data } = await getSupabase().from("tutors-connect-users").select(USER_COLUMNS).eq("github_id", studentId).maybeSingle();
      return (data as TutorsTimeRows["users"][number] | null) ?? null;
    }
  };
}

export function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

export function readerTimeSource(readerUrl: string, fetchFn: typeof fetch = (...args) => fetch(...args)): TutorsTimeSource {
  const base = withoutTrailingSlashes(readerUrl);
  const cache = new Map<string, { at: number; rows: Promise<TutorsTimeRows> }>();

  async function load(courseId: string): Promise<TutorsTimeRows> {
    const response = await fetchFn(`${base}/api/time/${encodeURIComponent(courseId)}`, { credentials: "include", headers: { accept: "application/json" } });
    if (!response.ok) throw new TutorsTimeSourceError(`The reader answered ${response.status} for the time data of ${courseId}`, response.status);
    return (await response.json()) as TutorsTimeRows;
  }

  function courseRows(courseId: string): Promise<TutorsTimeRows> {
    const hit = cache.get(courseId);
    if (hit && Date.now() - hit.at < 30_000) return hit.rows;
    const rows = load(courseId);
    cache.set(courseId, { at: Date.now(), rows });
    rows.catch(() => cache.delete(courseId));
    return rows;
  }

  return {
    courseRows,
    async courseRecord(courseId) {
      return (await courseRows(courseId)).course;
    },
    async user(studentId, courseId) {
      if (!courseId) return null;
      return (await courseRows(courseId)).users.find((u) => u.github_id === studentId) ?? null;
    }
  };
}

let current: TutorsTimeSource | null = null;
const listeners = new Set<() => void>();

export function setTutorsTimeSource(source: TutorsTimeSource): void {
  current = source;
  for (const listener of listeners) listener();
}

export function getTutorsTimeSource(): TutorsTimeSource {
  current ??= supabaseTimeSource();
  return current;
}

export function onTutorsTimeSourceChange(listener: () => void): void {
  listeners.add(listener);
}
