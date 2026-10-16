/**
 * Tutors Live's help queue: the queue service over the reader's /api/assistance, called from Live's
 * origin with the lecturer's reader session, and the course's help queue topic. Live reports itself as
 * a watcher of the topic every LIVE_WATCH_MS, which is what makes the reader's server publish each
 * change there (realtime_claim_assistance_publish), charged to Live's daily budget.
 */
import * as env from "$app/env/public";
import { topics } from "@tutors/realtime";
import { realtime } from "../services/realtime.ts";
import { LIVE_WATCH_MS, liveWatcherId } from "../services/live-feed.ts";
import { watchLiveTopic } from "../utils/supabase-client.ts";
import { HELP_STATES } from "./help-request.ts";
import { readerHelpDesk } from "./desk.ts";
import { createHelpQueueService, type HelpQueueChange } from "./queue.svelte.ts";

export { placeOf, type QueueRow } from "./queue.svelte.ts";

/** A notice as the reader's server publishes it, `{ courseId, id, state }`, for the course watched; anything else is ignored. */
function changeOf(payload: unknown, courseId: string): HelpQueueChange | null {
  const p = payload as { courseId?: unknown; id?: unknown; state?: unknown } | null;
  if (!p || p.courseId !== courseId || typeof p.id !== "string" || !(HELP_STATES as readonly unknown[]).includes(p.state)) return null;
  return { id: p.id, state: p.state as HelpQueueChange["state"] };
}

/** Hears a course's help queue topic and keeps this tab reported as its watcher, until the returned function is called. */
export function watchHelpQueue(courseId: string, onChange: (change: HelpQueueChange) => void): () => void {
  const topic = topics.helpQueue(courseId);
  const subscription = realtime.subscribe(topic, {
    events: ["help-request"],
    onMessage: (_event, payload) => {
      const change = changeOf(payload, courseId);
      if (change) onChange(change);
    }
  });
  const report = () => void watchLiveTopic(topic, liveWatcherId());
  const timer = setInterval(report, LIVE_WATCH_MS);
  report();
  return () => {
    clearInterval(timer);
    void subscription.close();
  };
}

const desk = readerHelpDesk((env.PUBLIC_READER_ORIGIN || "https://tutors.dev").replace(/\/$/, ""));

export const helpQueueService = createHelpQueueService(() => ({ desk, nowMs: () => Date.now(), watch: watchHelpQueue }));
