import type { TutorsConnectCourse, TutorsConnectUser } from "../types/index.ts";
import { getSupabase } from "./supabase.ts";

/**
 * Where the time library gets its rows from.
 *
 * - `supabaseTimeSource()` (the default) queries the tables with the key given to `initSupabase`.
 *   It suits a server holding a key that may read them.
 * - `readerTimeSource(readerUrl)` asks the Tutors reader's `GET /api/time/<courseId>` with the
 *   browser's reader session (`credentials: "include"`). The reader checks who is signed in: an
 *   educator of the course gets every row, anyone else their own rows with classmates pseudonymised.
 *   Tutors' own apps use this one, so no browser needs to read student rows with the anon key.
 */

/** A course's time rows, in the shape of their tables. */
export interface TutorsTimeRows {
  courseId: string;
  /** "educator" when the viewer teaches the course; "student" when other students are pseudonymised. */
  role: "educator" | "student";
  course: Pick<TutorsConnectCourse, "course_id" | "course_record"> | null;
  calendar: Record<string, unknown>[];
  learningRecords: Record<string, unknown>[];
  users: Omit<TutorsConnectUser, "email">[];
  assignments: { id: number; name: string | null; url: string | null; due_date: string | null; opened_date: string | null; submissionCount: number }[];
}

export interface TutorsTimeSource {
  /** Every time row of the course that the viewer may see. */
  courseRows(courseId: string): Promise<TutorsTimeRows>;
  /** The course's catalogue record (title, image, icon), or null. */
  courseRecord(courseId: string): Promise<Pick<TutorsConnectCourse, "course_id" | "course_record"> | null>;
  /** One student's user row, or null. `courseId` scopes the lookup for sources that answer per course. */
  user(studentId: string, courseId?: string): Promise<Omit<TutorsConnectUser, "email"> | null>;
}

/** A failed read of the reader's time API, with its HTTP status (401: not signed in to the reader). */
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

/** Reads the tables directly with the key given to `initSupabase`. */
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

/**
 * Reads a course's rows from the Tutors reader at `readerUrl` (e.g. `https://tutors.dev`), sending
 * the reader's session cookie. One answer per course is reused for 30 seconds, so the app bar, the
 * calendar and the lab views of one page load share a request.
 */
export function readerTimeSource(readerUrl: string, fetchFn: typeof fetch = (...args) => fetch(...args)): TutorsTimeSource {
  const base = readerUrl.replace(/\/+$/, "");
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

/** Chooses where the time library reads from; clears anything it cached from the previous source. */
export function setTutorsTimeSource(source: TutorsTimeSource): void {
  current = source;
  for (const listener of listeners) listener();
}

export function getTutorsTimeSource(): TutorsTimeSource {
  current ??= supabaseTimeSource();
  return current;
}

/** Lets a cache inside the library empty itself when the source changes. */
export function onTutorsTimeSourceChange(listener: () => void): void {
  listeners.add(listener);
}
