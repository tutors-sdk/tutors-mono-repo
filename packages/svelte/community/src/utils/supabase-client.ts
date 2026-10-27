import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as env from "$app/env/public";
import type { Course, Lo } from "@tutors/tutors-model-lib";
import type { TutorsId } from "@tutors/tutors-model-lib";
import { COURSE_SENTIMENT_IDS } from "@tutors/tutors-model-lib";
import type { TutorsConnectLatestRow } from "../types.svelte.ts";
import log, { withRequestId, withTimeout } from "@tutors/logger";
import { dataApi } from "@tutors/data-api";
import { realtimeClientOptions } from "@tutors/realtime-supabase";

export let supabase: SupabaseClient;

// Configuration is read at runtime. The client is only created when the app is
// not in anonymous mode AND a URL and key are present, so an unconfigured
// environment (including the SvelteKit build analysis step, which imports
// server modules with no env) degrades to "no Supabase" instead of throwing.
const supabaseConfigured = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);

if (env.PUBLIC_ANON_MODE !== "TRUE") {
  if (supabaseConfigured) {
    // On the server, calls made while serving a request carry its x-request-id; in the browser this is plain fetch.
    supabase = createClient(env.PUBLIC_SUPABASE_URL!, env.PUBLIC_SUPABASE_ANON_KEY!, { global: { fetch: withTimeout(withRequestId()) }, realtime: realtimeClientOptions() });
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

export async function upsertTutorsConnectLatestLo(loRecord: object): Promise<void> {
  const courseId = (loRecord as { courseId?: string }).courseId?.trim();
  if (!courseId) return;
  await dataApi.reportPresence({ courseId, payload: loRecord });
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
 * Stored Lo snapshots for a course received at or after `sinceIso`: the students active recently.
 * Sorted by `received_at` descending (most recently updated first).
 * @returns null when the read fails, so a caller can tell a failure from a course nobody is in
 */
export async function getTutorsConnectRecentLosByCourseId(courseId: string, sinceIso: string): Promise<TutorsConnectLatestRow[] | null> {
  if (env.PUBLIC_ANON_MODE === "TRUE" || typeof supabase === "undefined") return [];

  const id = courseId?.trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from("tutors-connect-latest")
    .select("course_id, student_id, payload, received_at")
    .eq("course_id", id)
    .gte("received_at", sinceIso)
    .order("received_at", { ascending: false });

  if (error) {
    log.error("getTutorsConnectRecentLosByCourseId failed:", error);
    return null;
  }

  return (data ?? []) as TutorsConnectLatestRow[];
}

/**
 * Stored Lo snapshots across every course received at or after `sinceIso`, at most `limit` of them:
 * Tutors Live's platform feed while it reads stored activity instead of Realtime.
 * Sorted by `received_at` descending (most recently updated first).
 * @returns null when the read fails
 */
export async function getTutorsConnectRecentLos(sinceIso: string, limit = 200): Promise<TutorsConnectLatestRow[] | null> {
  if (env.PUBLIC_ANON_MODE === "TRUE" || typeof supabase === "undefined") return [];

  const { data, error } = await supabase
    .from("tutors-connect-latest")
    .select("course_id, student_id, payload, received_at")
    .gte("received_at", sinceIso)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (error) {
    log.error("getTutorsConnectRecentLos failed:", error);
    return null;
  }

  return (data ?? []) as TutorsConnectLatestRow[];
}

/** How much of the day's Live Realtime budget is spent: under 70%, from 70%, from 90% (supabase/migrations/20261016_realtime_live_budget.sql). */
export type LiveBudgetTier = "normal" | "slow" | "paused";

/**
 * Reports this Tutors Live tab as a watcher of a Realtime topic, so the reader's server publishes to it.
 * @returns the day's budget tier, or null when the report failed (including before the migration is applied)
 */
export async function watchLiveTopic(topic: string, watcher: string): Promise<LiveBudgetTier | null> {
  if (env.PUBLIC_ANON_MODE === "TRUE" || typeof supabase === "undefined") return null;

  const { data, error } = await supabase.rpc("realtime_watch", { p_topic: topic, p_watcher: watcher });
  if (error) {
    log.warn("realtime_watch failed:", error);
    return null;
  }
  const tier = (data as { tier?: string } | null)?.tier;
  return tier === "normal" || tier === "slow" || tier === "paused" ? tier : null;
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

export async function recordLearningPageLoad(course: Course, loid: string, lo: Lo): Promise<void> {
  if (!course.courseId || !loid) return;
  await dataApi.recordAnalytics({ kind: "page-load", courseId: course.courseId, loId: loid, loType: lo.type, day: formatDate(new Date()) });
}

export async function recordLearningTick(courseId: string, loId: string | null): Promise<void> {
  if (!courseId) return;
  await dataApi.recordAnalytics({ kind: "tick", courseId, loId, day: formatDate(new Date()) });
}

export async function addOrUpdateStudent(student: TutorsId) {
  if (!student) return;
  const body: { sentiment?: string; onlineStatus?: "online" | "offline" } = {};
  const sentiment = normalizeStoredSentiment(student.sentiment);
  if (sentiment) body.sentiment = sentiment;
  if (student.share === "true") body.onlineStatus = "online";
  else if (student.share === "false") body.onlineStatus = "offline";
  const response = await dataApi.saveMe(body);
  if (response && !response.ok && response.status !== 401 && response.status !== 503) {
    throw new Error(`Saving the student record failed with status ${response.status}`);
  }
}

function normalizeStoredSentiment(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim();
  return (COURSE_SENTIMENT_IDS as readonly string[]).includes(s) ? s : null;
}


export async function getTutorsConnectUserSentiment(githubId: string): Promise<string | null> {
  if (env.PUBLIC_ANON_MODE === "TRUE" || !githubId) return null;
  const status = await dataApi.getMyStatus();
  return normalizeStoredSentiment(status?.sentiment);
}

export async function updateTutorsConnectUserSentiment(githubId: string, sentiment: string) {
  if (env.PUBLIC_ANON_MODE === "TRUE" || !githubId) return;
  const response = await dataApi.changeMyStatus({ sentiment });
  if (response && !response.ok && response.status !== 401) throw new Error(`Saving the sentiment failed with status ${response.status}`);
}

export async function getTutorsConnectUserOnlineStatus(githubId: string): Promise<string | null> {
  if (env.PUBLIC_ANON_MODE === "TRUE" || !githubId) return null;
  const raw = (await dataApi.getMyStatus())?.online_status;
  if (raw == null || !String(raw).trim()) return null;
  return String(raw).trim();
}

export async function updateTutorsConnectUserOnlineStatus(githubId: string, onlineStatus: "online" | "offline") {
  if (env.PUBLIC_ANON_MODE === "TRUE" || !githubId) return;
  const response = await dataApi.changeMyStatus({ onlineStatus });
  if (response && !response.ok && response.status !== 401) throw new Error(`Saving the online status failed with status ${response.status}`);
}
