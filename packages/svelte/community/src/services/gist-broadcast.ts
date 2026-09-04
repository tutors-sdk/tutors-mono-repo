/**
 * Student → lecturer real-time notification for shared snippets (issue #155).
 *
 * Mirrors `broadcast.ts` (issue #78, lecturer → student) but is a separate,
 * self-contained module so it can evolve independently:
 *
 *   - Event: `gist-created` over the per-course Supabase Realtime broadcast
 *     channel (cross-browser) plus a `BroadcastChannel` relay (same browser).
 *   - Delivered exactly once per tab (idempotency id), regardless of how many
 *     delivery paths carried the message.
 *   - No rate limit (a student may share several snippets); the rate limit the
 *     reader applies lives server-side on `POST /api/gists`.
 *
 * It is deliberately plain TypeScript (no Svelte runes) so it can be imported
 * from vitest and from `.svelte.ts` services alike.
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/** A Supabase client narrow enough for this module (type-only, no runtime). */
export type SupabaseLike = Pick<SupabaseClient, "channel" | "removeChannel">;

/** Wire event name (hyphenated to match the `lo-event` / `course-broadcast` convention). */
const GIST_CREATED_EVENT = "gist-created";

export interface GistCreatedEvent {
  type: "gist-created";
  /** Stable id — guarantees exactly-once delivery per tab (crosses Supabase/BroadcastChannel). */
  id: string;
  courseId: string;
  gistId: string;
  gistUrl: string;
  student_id: string;
  student_name?: string;
  title?: string;
  lo_route?: string;
  lo_title?: string;
  expires_at?: string;
  sentAt: number;
}

function defaultId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `gist-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const BROADCAST_CONFIG = { config: { broadcast: { self: true } } };

type Handler = (e: GistCreatedEvent) => void;

interface CourseState {
  courseId: string;
  channel: RealtimeChannel | null;
  bc: BroadcastChannel | null;
  dispatchers: Set<Handler>;
  receivedIds: Set<string>;
}

const MAX_RECEIVED_IDS = 256;
const stateMap = new Map<string, CourseState>();
let supabase: SupabaseLike | null = null;

/** Attach the Supabase client used for cross-browser delivery (anon mode → null). */
export function setGistSupabase(client: SupabaseLike | null): void {
  supabase = client;
}

/**
 * Subscribe to gist-created events for a course.
 * Returns an unsubscribe function.
 */
export function onGistCreated(courseId: string, handler: Handler): () => void {
  const state = stateFor(courseId);
  state.dispatchers.add(handler);
  return () => state.dispatchers.delete(handler);
}

/**
 * Fire a gist-created event for a course (student → lecturer toast).
 * Requires a configured Supabase client.
 * @returns `true` on success, `false` if not configured.
 */
export function sendGistCreated(courseId: string, event: Omit<GistCreatedEvent, "type" | "id" | "sentAt">): boolean {
  if (!supabase || !courseId || !event || !event.gistId || !event.gistUrl) return false;
  const state = stateFor(courseId);
  const payload: GistCreatedEvent = {
    type: "gist-created",
    id: defaultId(),
    courseId,
    gistId: event.gistId,
    gistUrl: event.gistUrl,
    student_id: event.student_id,
    student_name: event.student_name,
    title: event.title,
    lo_route: event.lo_route,
    lo_title: event.lo_title,
    expires_at: event.expires_at,
    sentAt: Date.now()
  };
  state.channel?.send({ type: "broadcast", event: GIST_CREATED_EVENT, payload });
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
    receivedIds: new Set()
  };

  if (supabase) {
    state.channel = supabase
      .channel(courseId, BROADCAST_CONFIG)
      .on("broadcast", { event: GIST_CREATED_EVENT }, (msg: { payload?: unknown }) => {
        const e = msg.payload as GistCreatedEvent;
        if (isGistCreated(e, courseId)) dispatchIfNew(state, e);
      })
      .subscribe();
  }

  if (typeof BroadcastChannel !== "undefined") {
    state.bc = new BroadcastChannel(`tutors-gist-created-${courseId}`);
    state.bc.onmessage = (event: MessageEvent) => {
      const e = event.data as GistCreatedEvent;
      if (isGistCreated(e, courseId)) dispatchIfNew(state, e);
    };
  }

  stateMap.set(courseId, state);
  return state;
}

function dispatchIfNew(state: CourseState, e: GistCreatedEvent): void {
  if (state.receivedIds.has(e.id)) return;
  state.receivedIds.add(e.id);
  if (state.receivedIds.size > MAX_RECEIVED_IDS) {
    const oldest = state.receivedIds.values().next().value as string | undefined;
    state.receivedIds.delete(oldest as string);
  }
  for (const handler of state.dispatchers) {
    try {
      handler(e);
    } catch {
      /* A broken listener must never take down the delivery loop. */
    }
  }
}

function isGistCreated(e: unknown, courseId: string): e is GistCreatedEvent {
  const rec = e as GistCreatedEvent | null;
  return (
    rec != null &&
    rec.type === "gist-created" &&
    rec.courseId === courseId &&
    typeof rec.gistId === "string" &&
    rec.gistId.length > 0 &&
    typeof rec.gistUrl === "string" &&
    rec.gistUrl.length > 0 &&
    typeof rec.id === "string" &&
    rec.id.length > 0
  );
}

// ── Test seams ─────────────────────────────────────────────────────────────────

export function __deliverGistCreated(courseId: string, payload: unknown): void {
  const state = stateMap.get(courseId);
  const e = payload as GistCreatedEvent;
  if (state && isGistCreated(e, courseId)) dispatchIfNew(state, e);
}

export function __resetGistBroadcastForTests(): void {
  for (const state of stateMap.values()) {
    state.bc?.close();
  }
  stateMap.clear();
  supabase = null;
}
