import * as env from "$app/env/public";
import { topics, type RealtimeAdapter, type Topic } from "@tutors/realtime";
import { supabaseRealtimeAdapter } from "@tutors/realtime-supabase";
import log from "@tutors/logger";
import type { LoRecord } from "../types.svelte.ts";
import { claimLivePublish, supabase, type LiveBudgetTier } from "../utils/supabase-client.ts";

/**
 * The reader's server side of Tutors Live (POST /api/live/activity). The browser sends each learning
 * event here instead of broadcasting it; this publishes it only to the Realtime topics a Tutors Live tab
 * is watching, within the day's budget (supabase/migrations/20261016_realtime_live_budget.sql).
 *
 * Each request publishes at once. Batching events over a few seconds needs state that outlives a
 * request, which a Netlify function does not keep; it waits for the reader to run as one long-lived
 * server.
 */

export const MAX_LIVE_ACTIVITY_BYTES = 4096;
const MAX_ID = 200;
const MAX_USER_ID = 100;
const MAX_TEXT = 1000;
const MAX_ICON_KEYS = 8;

export type LiveActivityResponse = { status: number; body?: { tier: LiveBudgetTier | null; topics: string[] } | { message: string } };

let adapter: RealtimeAdapter | null = null;

function text(value: unknown, max: number, required = false): string | undefined | false {
  if (value === undefined || value === null) return required ? false : undefined;
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) return false;
  return value;
}

/**
 * The LoRecord the browser built, copied field by field so nothing else reaches a broadcast.
 * @returns the record, or a reason it was refused
 */
export function parseLiveActivity(raw: string): LoRecord | string {
  if (new TextEncoder().encode(raw).length > MAX_LIVE_ACTIVITY_BYTES) return "body is larger than 4 KB";
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return "body is not JSON";
  }
  if (!body || typeof body !== "object") return "body is not an object";
  const b = body as Record<string, unknown>;
  const u = (b.user && typeof b.user === "object" ? b.user : {}) as Record<string, unknown>;

  const courseId = text(b.courseId, MAX_ID, true);
  const userId = text(u.id, MAX_USER_ID, true);
  if (!courseId) return "courseId is required, at most 200 characters";
  if (!userId) return "user.id is required, at most 100 characters";

  const fields = { courseUrl: b.courseUrl, courseTitle: b.courseTitle, title: b.title, loRoute: b.loRoute, img: b.img, type: b.type };
  const userFields = { fullName: u.fullName, avatar: u.avatar, sentiment: u.sentiment };
  const record: Record<string, unknown> = { courseId };
  for (const [key, value] of Object.entries(fields)) {
    const checked = text(value, MAX_TEXT);
    if (checked === false) return `${key} must be a string of at most ${MAX_TEXT} characters`;
    if (checked !== undefined) record[key] = checked;
  }
  const user: Record<string, unknown> = { id: userId };
  for (const [key, value] of Object.entries(userFields)) {
    const checked = text(value, MAX_TEXT);
    if (checked === false) return `user.${key} must be a string of at most ${MAX_TEXT} characters`;
    if (checked !== undefined) user[key] = checked;
  }
  record.user = user;
  if (b.isPrivate !== undefined) {
    if (typeof b.isPrivate !== "boolean") return "isPrivate must be a boolean";
    record.isPrivate = b.isPrivate;
  }
  if (b.icon !== undefined && b.icon !== null) {
    if (typeof b.icon !== "object" || Array.isArray(b.icon)) return "icon must be an object of strings";
    const entries = Object.entries(b.icon as Record<string, unknown>);
    if (entries.length > MAX_ICON_KEYS || entries.some(([, value]) => typeof value !== "string" || value.length > MAX_TEXT)) return "icon must be an object of strings";
    record.icon = Object.fromEntries(entries);
  }
  return record as unknown as LoRecord;
}

/**
 * Publishes one learning event to the topics the database allows.
 * 400 for a malformed body; 204 in anonymous mode; otherwise 202 with the tier and the topics published
 * to. A claim that fails (the migration not applied, the database unreachable) publishes nothing.
 */
export async function receiveLiveActivity(raw: string): Promise<LiveActivityResponse> {
  const record = parseLiveActivity(raw);
  if (typeof record === "string") return { status: 400, body: { message: record } };
  if (env.PUBLIC_ANON_MODE === "TRUE" || typeof supabase === "undefined") return { status: 204 };

  const claim = await claimLivePublish(record.courseId);
  if (!claim) return { status: 202, body: { tier: null, topics: [] } };

  const allowed = new Map<string, Topic>([
    [topics.courseActivity(record.courseId), topics.courseActivity(record.courseId)],
    [topics.platformActivity(), topics.platformActivity()]
  ]);
  const targets = claim.topics.map((topic) => allowed.get(topic)).filter((topic): topic is Topic => topic !== undefined);
  adapter ??= supabaseRealtimeAdapter(supabase);
  const results = await Promise.allSettled(targets.map((topic) => adapter!.publish(topic, "lo-event", record)));
  results.forEach((result, i) => {
    if (result.status === "rejected") log.error("Live activity broadcast failed:", targets[i], result.reason);
  });
  return { status: 202, body: { tier: claim.tier, topics: targets } };
}
