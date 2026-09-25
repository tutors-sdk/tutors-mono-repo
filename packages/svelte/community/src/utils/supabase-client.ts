/**
 * @service SupabaseClient
 * The browser's Supabase client (anon key) and the reader's data operations.
 *
 * The anon client is used only for realtime presence channels and for reading public data (the
 * catalogue, content locks, shared presence). Everything that writes or reads a student's own data
 * goes to the reader's /api routes through `readerApi`, where the server checks the Auth.js session.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "$env/dynamic/public";
import type { Course, Lo } from "@tutors/tutors-model-lib";
import type { TutorsId } from "@tutors/tutors-model-lib";
import { COURSE_SENTIMENT_IDS } from "@tutors/tutors-model-lib";
import type { TutorsConnectLatestRow } from "../types.svelte.ts";
import log, { withRequestId } from "@tutors/logger";
import { readerApi, readerApiJson } from "./reader-api.ts";

export let supabase: SupabaseClient;

// Configuration is read at runtime. The client is only created when the app is
// not in anonymous mode AND a URL and key are present, so an unconfigured
// environment (including the SvelteKit build analysis step, which imports
// server modules with no env) degrades to "no Supabase" instead of throwing.
const supabaseConfigured = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);

if (env.PUBLIC_ANON_MODE !== "TRUE") {
  if (supabaseConfigured) {
    // On the server, calls made while serving a request carry its x-request-id; in the browser this is plain fetch.
    supabase = createClient(env.PUBLIC_SUPABASE_URL!, env.PUBLIC_SUPABASE_ANON_KEY!, { global: { fetch: withRequestId() } });
  } else {
    log.warn("Supabase is not configured (PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing); running without it");
  }
}

export function localYyyyMmDd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function instantLocalYmd(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  try {
    const d = new Date(iso.trim());
    if (!Number.isFinite(d.getTime())) return null;
    return localYyyyMmDd(d);
  } catch {
    return null;
  }
}

function startOfLocalMondayWeek(d: Date): number {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Local calendar day match (same semantics as `localYyyyMmDd` / `instantLocalYmd`). */
export function isReceivedAtOnLocalDay(iso: string | null | undefined, ref = new Date()): boolean {
  const ymd = instantLocalYmd(iso);
  if (!ymd) return false;
  return ymd === localYyyyMmDd(ref);
}

/** Local week starting Monday, through Sunday. */
export function isReceivedAtInLocalWeek(iso: string | null | undefined, ref = new Date()): boolean {
  if (!iso?.trim()) return false;
  const d = new Date(iso.trim());
  if (!Number.isFinite(d.getTime())) return false;
  return startOfLocalMondayWeek(d) === startOfLocalMondayWeek(ref);
}

export function isReceivedAtInLocalMonth(iso: string | null | undefined, ref = new Date()): boolean {
  if (!iso?.trim()) return false;
  const d = new Date(iso.trim());
  if (!Number.isFinite(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export function isReceivedAtInLocalYear(iso: string | null | undefined, ref = new Date()): boolean {
  if (!iso?.trim()) return false;
  const d = new Date(iso.trim());
  if (!Number.isFinite(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear();
}

/**
 * Record the learning object a student who shares their presence is on, as the latest for the course.
 * Fire-and-forget from presence; does not throw. The reader's server stores it under the session's login.
 */
export async function upsertTutorsConnectLatestLo(loRecord: object): Promise<void> {
  const courseId = (loRecord as { courseId?: string }).courseId?.trim();
  if (!courseId) return;
  await readerApi("POST", "/api/presence", { courseId, payload: loRecord });
}

/**
 * All stored Lo snapshots for a course (one row per student, already “latest” by key).
 * Sorted by `received_at` descending (most recently updated first).
 */
export async function getTutorsConnectLatestLosByCourseId(courseId: string): Promise<TutorsConnectLatestRow[]> {
  if (env.PUBLIC_ANON_MODE === "TRUE" || typeof supabase === "undefined") return [];

  const id = courseId?.trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from("tutors-connect-latest")
    .select("course_id, student_id, payload, received_at")
    .eq("course_id", id)
    .order("received_at", { ascending: false });

  if (error) {
    log.error("getTutorsConnectLatestLosByCourseId failed:", error);
    return [];
  }

  return (data ?? []) as TutorsConnectLatestRow[];
}

/**
 * Formats a date into a standardized string format
 * @param date - Date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear().toString();
  let month = (d.getMonth() + 1).toString();
  let day = d.getDate().toString();
  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;
  return [year, month, day].join("-");
}

/**
 * Record that the signed-in student loaded a learning object: the reader's server bumps the learning
 * record and today's calendar row, under the session's login.
 * @param course - Course data
 * @param loid - Learning object identifier (its route)
 * @param lo - Learning object data
 */
export async function recordLearningPageLoad(course: Course, loid: string, lo: Lo): Promise<void> {
  if (!course.courseId || !loid) return;
  await readerApi("POST", "/api/analytics", { kind: "page-load", courseId: course.courseId, loId: loid, loType: lo.type, day: formatDate(new Date()) });
}

/**
 * Record another 30 seconds on a page: the reader's server bumps the learning object's duration
 * (when `loId` is given) and today's active time.
 */
export async function recordLearningTick(courseId: string, loId: string | null): Promise<void> {
  if (!courseId) return;
  await readerApi("POST", "/api/analytics", { kind: "tick", courseId, loId, day: formatDate(new Date()) });
}

/**
 * On sign-in: create or refresh the signed-in user's row. The reader's server takes the name, email and
 * avatar from the Auth.js session; only the sentiment and sharing choice come from here.
 * @param student - The signed-in user
 */
export async function addOrUpdateStudent(student: TutorsId) {
  if (!student) return;
  const body: { sentiment?: string; onlineStatus?: "online" | "offline" } = {};
  const sentiment = normalizeStoredSentiment(student.sentiment);
  if (sentiment) body.sentiment = sentiment;
  if (student.share === "true") body.onlineStatus = "online";
  else if (student.share === "false") body.onlineStatus = "offline";
  const response = await readerApi("PUT", "/api/me", body);
  if (response && !response.ok && response.status !== 401 && response.status !== 503) {
    throw new Error(`Saving the student record failed with status ${response.status}`);
  }
}

function normalizeStoredSentiment(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim();
  return (COURSE_SENTIMENT_IDS as readonly string[]).includes(s) ? s : null;
}

type MyStatus = { sentiment: string | null; online_status: string | null };

/**
 * The signed-in user's stored sentiment, from the reader's server.
 * @param githubId - The signed-in user's GitHub login; the server answers for the session, whatever it is
 * @returns Stored sentiment if present and valid per {@link COURSE_SENTIMENT_IDS}, otherwise null (includes no row).
 */
export async function getTutorsConnectUserSentiment(githubId: string): Promise<string | null> {
  if (env.PUBLIC_ANON_MODE === "TRUE" || !githubId) return null;
  const status = await readerApiJson<MyStatus>("/api/me");
  return normalizeStoredSentiment(status?.sentiment);
}

/**
 * Updates the signed-in user's sentiment (and last-accessed).
 * @param githubId - The signed-in user's GitHub login
 * @param sentiment - Current mood string
 */
export async function updateTutorsConnectUserSentiment(githubId: string, sentiment: string) {
  if (env.PUBLIC_ANON_MODE === "TRUE" || !githubId) return;
  const response = await readerApi("PATCH", "/api/me", { sentiment });
  if (response && !response.ok && response.status !== 401) throw new Error(`Saving the sentiment failed with status ${response.status}`);
}

/**
 * The signed-in user's stored online_status (mirrors Share Presence / {@link updateTutorsConnectUserOnlineStatus}).
 * @param githubId - The signed-in user's GitHub login
 * @returns Stored online_status if present, otherwise null (includes no row).
 */
export async function getTutorsConnectUserOnlineStatus(githubId: string): Promise<string | null> {
  if (env.PUBLIC_ANON_MODE === "TRUE" || !githubId) return null;
  const raw = (await readerApiJson<MyStatus>("/api/me"))?.online_status;
  if (raw == null || !String(raw).trim()) return null;
  return String(raw).trim();
}

/**
 * Sets the signed-in user's online_status (mirrors share: visible / sharing = online).
 */
export async function updateTutorsConnectUserOnlineStatus(githubId: string, onlineStatus: "online" | "offline") {
  if (env.PUBLIC_ANON_MODE === "TRUE" || !githubId) return;
  const response = await readerApi("PATCH", "/api/me", { onlineStatus });
  if (response && !response.ok && response.status !== 401) throw new Error(`Saving the online status failed with status ${response.status}`);
}
