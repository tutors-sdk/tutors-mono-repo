/**
 * Lecturer → student toast broadcasting (issue #78).
 *
 * This module is intentionally plain TypeScript (no Svelte runes / `$state`)
 * so it can be imported from vitest and from `.svelte.ts` services alike
 * without needing the Svelte compiler at test time (see the note in
 * tests/components/runes/course-store.test.ts).
 *
 * Transport
 * ---------
 * - **Cross-browser**: Supabase Realtime broadcast on the course channel topic.
 *   Supabase routes each broadcast to every connected client that joined the
 *   same topic, so the send and receive sides must share it (just like the
 *   existing `lo-event` feature).
 * - **Cross-tab, same browser**: the `BroadcastChannel` API (the same pattern
 *   used by quiz notifications in tutors-sdk/tutors#1093). It is lower
 *   latency than round-tripping through Supabase for same-origin tabs.
 *
 * Exactly once per tab
 * --------------------
 * A single student tab is wired with up to two delivery paths (the Supabase
 * receive handler and the BroadcastChannel handler), and both can carry the
 * same message (e.g. when the lecturer is in another tab of the same browser,
 * or when the sender's own Supabase echo comes back). To guarantee a student
 * sees each toast exactly once, every delivery path funnels through
 * `dispatchIfNew`, which tracks the set of broadcast ids this tab has already
 * shown. The first arrival wins; subsequent arrivals with the same `id` are
 * dropped. This gives uniform "exactly-once per tab" behaviour regardless of
 * how many paths delivered the message.
 *
 * Rate limit
 * ----------
 * One broadcast per 60 seconds per (client, course) pair. This satisfies the
 * issue's "max 1 per minute" acceptance criterion and prevents UI spam.
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/** A Supabase client narrow enough for this module (type-only, no runtime). */
export type SupabaseLike = Pick<SupabaseClient, "channel" | "removeChannel">;

/** Wire event name (hyphenated to match the `lo-event` convention). */
const BROADCAST_EVENT = "course-broadcast";

/** The broadcast payload as it crosses the wire (Supabase / BroadcastChannel). */
export interface CourseBroadcast {
  type: "course:broadcast";
  /** Stable unique id — used to guarantee exactly-once display per tab. */
  id: string;
  courseId: string;
  /** Short headline shown in the toast. */
  title: string;
  /** Long-form body shown under the title. */
  description: string;
  actionUrl?: string;
  actionLabel?: string;
  senderName: string;
  sentAt: number;
}

/** User-facing broadcast fields (what the lecturer composes). */
export interface CourseBroadcastMessage {
  title: string;
  description: string;
  actionUrl?: string;
  actionLabel?: string;
}

type Handler = (b: CourseBroadcast) => void;

/** One broadcast per this many ms per (client, course). */
export const BROADCAST_RATE_LIMIT_MS = 60_000;

/**
 * How many "already-shown" ids to remember per course before evicting the
 * oldest. Bounds memory for a very busy session while keeping the window long
 * enough that no real broadcast is ever lost to a false eviction.
 */
const MAX_RECEIVED_IDS = 256;

const BROADCAST_CONFIG = { config: { broadcast: { self: true } } };

interface CourseState {
  courseId: string;
  /** Supabase channel on the course topic (null in anon mode / without a client). */
  channel: RealtimeChannel | null;
  /** BroadcastChannel for same-browser cross-tab relay (null in SSR/tests). */
  bc: BroadcastChannel | null;
  /** Registered receive handlers. */
  dispatchers: Set<Handler>;
  /** Broadcast ids this tab has already displayed (exactly-once guard). */
  receivedIds: Set<string>;
  /** Timestamp (ms) of the last send — used for rate limiting. */
  lastSentAt: number;
}

const stateMap = new Map<string, CourseState>();
let supabase: SupabaseLike | null = null;
let allowBroadcastChannel = true;

/**
 * Attach the Supabase client used for cross-browser delivery.
 * Call this once with the real client in the app, or a mock in tests.
 */
export function setBroadcastSupabase(client: SupabaseLike | null): void {
  supabase = client;
}

/**
 * Subscribe to lecturer-to-student broadcasts for a course.
 * Returns an unsubscribe function.
 *
 * @param courseId - The course to listen for broadcasts in
 * @param handler - Invoked exactly once per broadcast, per tab
 */
export function onCourseBroadcast(courseId: string, handler: Handler): () => void {
  const state = stateFor(courseId);
  state.dispatchers.add(handler);
  return () => state.dispatchers.delete(handler);
}

/**
 * Send a toast broadcast to all connected students in a course.
 *
 * Requires a configured Supabase client (broadcast is a network feature); the
 * BroadcastChannel relay is a best-effort extra for same-browser tabs.
 *
 * @param now - Injectable clock (ms) for deterministic rate-limit tests
 * @returns `true` on success, `false` if rate-limited or not configured
 */
export function sendCourseBroadcast(
  courseId: string,
  message: CourseBroadcastMessage,
  senderName: string,
  now: number = Date.now()
): boolean {
  if (!supabase || !courseId) return false;
  if (!message || !message.title || !message.description) return false;

  const state = stateFor(courseId);
  if (now - state.lastSentAt < BROADCAST_RATE_LIMIT_MS) return false;
  state.lastSentAt = now;

  const payload: CourseBroadcast = {
    type: "course:broadcast",
    id: newId(now),
    courseId,
    title: message.title,
    description: message.description,
    actionUrl: message.actionUrl || undefined,
    actionLabel: message.actionLabel || undefined,
    senderName: senderName || "Tutor",
    sentAt: now
  };

  // Cross-browser delivery — Supabase Realtime on the shared course topic.
  state.channel?.send({ type: "broadcast", event: BROADCAST_EVENT, payload });
  // Same-browser, cross-tab delivery — BroadcastChannel API.
  state.bc?.postMessage(payload);
  return true;
}

function stateFor(courseId: string): CourseState {
  const existing = stateMap.get(courseId);
  if (existing) return existing;

  const state: CourseState = {
    courseId,
    channel: null,
    bc: null,
    dispatchers: new Set(),
    receivedIds: new Set(),
    lastSentAt: 0
  };

  if (supabase) {
    state.channel = supabase
      .channel(courseId, BROADCAST_CONFIG)
      .on("broadcast", { event: BROADCAST_EVENT }, (msg: { payload?: unknown }) => {
        const b = msg.payload as CourseBroadcast;
        if (isCourseBroadcast(b, courseId)) dispatchIfNew(state, b);
      })
      .subscribe();
  }

  if (allowBroadcastChannel && typeof BroadcastChannel !== "undefined") {
    state.bc = new BroadcastChannel(`tutors-course-bcast-${courseId}`);
    state.bc.onmessage = (event: MessageEvent) => {
      const b = event.data as CourseBroadcast;
      if (isCourseBroadcast(b, courseId)) dispatchIfNew(state, b);
    };
  }

  stateMap.set(courseId, state);
  return state;
}

/**
 * Dispatch a broadcast to this tab's handlers, but only the first time the
 * `id` is seen. All delivery paths (Supabase / BroadcastChannel / the sender's
 * own echo) funnel through here so a toast is shown exactly once per tab.
 */
function dispatchIfNew(state: CourseState, b: CourseBroadcast): void {
  if (state.receivedIds.has(b.id)) return;
  state.receivedIds.add(b.id);
  if (state.receivedIds.size > MAX_RECEIVED_IDS) {
    const oldest = state.receivedIds.values().next().value as string | undefined;
    state.receivedIds.delete(oldest as string);
  }
  for (const handler of state.dispatchers) {
    try {
      handler(b);
    } catch {
      /* A broken toast listener must never take down the delivery loop. */
    }
  }
}

function isCourseBroadcast(b: unknown, courseId: string): b is CourseBroadcast {
  const rec = b as CourseBroadcast | null;
  return (
    rec != null &&
    rec.type === "course:broadcast" &&
    rec.courseId === courseId &&
    typeof rec.title === "string" &&
    rec.title.length > 0 &&
    typeof rec.description === "string" &&
    rec.description.length > 0 &&
    typeof rec.id === "string" &&
    rec.id.length > 0
  );
}

function newId(now: number): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${now}-${Math.random().toString(36).slice(2)}`;
  return `bc-${rand}`;
}

// ── Test seams ─────────────────────────────────────────────────────────────────

/** Toggle BroadcastChannel usage so tests can isolate the Supabase path. */
export function __setBroadcastChannelEnabled(enabled: boolean): void {
  allowBroadcastChannel = enabled;
}

/** Deliver a synthetic message as if a remote client sent it over Supabase. */
export function __deliverSupabase(courseId: string, payload: unknown): void {
  const state = stateMap.get(courseId);
  const b = payload as CourseBroadcast;
  if (state && isCourseBroadcast(b, courseId)) dispatchIfNew(state, b);
}

/** Deliver a synthetic message as if a sibling tab relayed it via BroadcastChannel. */
export function __deliverBroadcastChannel(courseId: string, payload: unknown): void {
  const state = stateMap.get(courseId);
  const b = payload as CourseBroadcast;
  if (state && isCourseBroadcast(b, courseId)) dispatchIfNew(state, b);
}

/** Reset all module state between tests. */
export function __resetForTests(): void {
  for (const state of stateMap.values()) {
    state.bc?.close();
  }
  stateMap.clear();
  supabase = null;
  allowBroadcastChannel = true;
}
