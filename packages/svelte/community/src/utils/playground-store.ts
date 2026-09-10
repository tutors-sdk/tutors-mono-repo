/**
 * Storage for playground snapshots — the only part of a playground that leaves the browser.
 *
 * A snapshot is written with an authenticated Supabase client rather than the anon one the
 * rest of Tutors uses. The rows have an owner and the policies on `playground_snapshots`
 * are written against the token's claims, so the token is not decoration: without it every
 * request is rejected.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, PUBLIC_ANON_MODE } from "$env/static/public";
import log from "@tutors/logger";

export interface PlaygroundSnapshotFile {
  path: string;
  content: string;
}

export interface PlaygroundSnapshot {
  studentId: string;
  studentName: string;
  courseId: string;
  loId: string;
  runtime: string;
  entry: string;
  files: PlaygroundSnapshotFile[];
  lastOutput: string;
  lastOk: boolean | null;
  updatedAt: string;
}

interface SnapshotRow {
  student_id: string;
  student_name: string | null;
  course_id: string;
  lo_id: string;
  runtime: string;
  entry: string;
  files: PlaygroundSnapshotFile[];
  last_output: string | null;
  last_ok: boolean | null;
  updated_at: string;
}

function toSnapshot(row: SnapshotRow): PlaygroundSnapshot {
  return {
    studentId: row.student_id,
    studentName: row.student_name ?? row.student_id,
    courseId: row.course_id,
    loId: row.lo_id,
    runtime: row.runtime,
    entry: row.entry,
    files: row.files ?? [],
    lastOutput: row.last_output ?? "",
    lastOk: row.last_ok,
    updatedAt: row.updated_at
  };
}

/** The reader endpoint that turns a signed-in session into a Supabase token. */
const TOKEN_ENDPOINT = "/api/runtime-token";

let cached: { token: string; courseId: string; expiresAt: number; client: SupabaseClient } | null = null;

/**
 * A Supabase client that acts as the signed-in student.
 *
 * Null whenever that is not possible — signed out, Supabase not configured, or a reader
 * deployment with no JWT secret. Every caller treats null as "this feature is not
 * available here" rather than as an error, because for most deployments it is not.
 */
export async function authedClient(courseId: string): Promise<SupabaseClient | null> {
  if (PUBLIC_ANON_MODE === "TRUE" || !PUBLIC_SUPABASE_URL) return null;
  if (cached && cached.courseId === courseId && cached.expiresAt > Date.now() + 30_000) return cached.client;

  try {
    const response = await fetch(`${TOKEN_ENDPOINT}?courseId=${encodeURIComponent(courseId)}`);
    if (!response.ok) return null;
    const { token, expiresIn } = (await response.json()) as { token: string; expiresIn: number };

    // The token rides on the Authorization header of every request this client makes,
    // which is what `auth.jwt()` reads on the other end.
    const client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    cached = { token, courseId, expiresAt: Date.now() + expiresIn * 1000, client };
    return client;
  } catch (error) {
    log.error("playground token request failed:", error);
    return null;
  }
}

/** Whether the signed-in user teaches this course, as the reader decided when it signed the token. */
export async function isCourseEducator(courseId: string): Promise<boolean> {
  const client = await authedClient(courseId);
  if (!client || !cached) return false;
  try {
    const claims = JSON.parse(atob(cached.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Array.isArray(claims.educator_courses) && claims.educator_courses.includes(courseId);
  } catch {
    return false;
  }
}

export async function savePlaygroundSnapshot(snapshot: Omit<PlaygroundSnapshot, "updatedAt">): Promise<boolean> {
  const client = await authedClient(snapshot.courseId);
  if (!client) return false;

  const { error } = await client.from("playground_snapshots").upsert(
    {
      student_id: snapshot.studentId,
      student_name: snapshot.studentName,
      course_id: snapshot.courseId,
      lo_id: snapshot.loId,
      runtime: snapshot.runtime,
      entry: snapshot.entry,
      files: snapshot.files,
      last_output: snapshot.lastOutput.slice(0, 20_000),
      last_ok: snapshot.lastOk,
      updated_at: new Date().toISOString()
    },
    { onConflict: "student_id, course_id, lo_id" }
  );

  if (error) {
    log.error("savePlaygroundSnapshot failed:", error);
    return false;
  }
  return true;
}

export async function getPlaygroundSnapshot(courseId: string, loId: string, studentId: string): Promise<PlaygroundSnapshot | null> {
  const client = await authedClient(courseId);
  if (!client) return null;

  const { data, error } = await client.from("playground_snapshots").select("*").eq("course_id", courseId).eq("lo_id", loId).eq("student_id", studentId).maybeSingle();

  if (error) {
    log.error("getPlaygroundSnapshot failed:", error);
    return null;
  }
  return data ? toSnapshot(data as SnapshotRow) : null;
}

/**
 * Every snapshot handed in for one exercise.
 *
 * Returns nothing for a student: the same query runs, and row-level security answers it
 * with their own row or with nothing at all.
 */
export async function listPlaygroundSnapshots(courseId: string, loId: string): Promise<PlaygroundSnapshot[]> {
  const client = await authedClient(courseId);
  if (!client) return [];

  const { data, error } = await client.from("playground_snapshots").select("*").eq("course_id", courseId).eq("lo_id", loId).order("updated_at", { ascending: false });

  if (error) {
    log.error("listPlaygroundSnapshots failed:", error);
    return [];
  }
  return ((data ?? []) as SnapshotRow[]).map(toSnapshot);
}

export async function removePlaygroundSnapshot(courseId: string, loId: string, studentId: string): Promise<void> {
  const client = await authedClient(courseId);
  if (!client) return;
  const { error } = await client.from("playground_snapshots").delete().eq("course_id", courseId).eq("lo_id", loId).eq("student_id", studentId);
  if (error) log.error("removePlaygroundSnapshot failed:", error);
}
