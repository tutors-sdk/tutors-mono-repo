import type { Topic } from "@tutors/realtime";
import type { LoRecord, TutorsConnectLatestRow } from "../types.svelte.ts";
import { watchLiveTopic } from "../utils/supabase-client.ts";

/** How often a Tutors Live tab reports itself as a watcher, and reads stored activity while it must. */
export const LIVE_WATCH_MS = 60 * 1000;
/** How far back a stored-activity read looks: two reports, so a missed tick loses nothing. */
export const LIVE_STORED_WINDOW_MS = 2 * 60 * 1000;

let watcherId = "";

/** This tab's watcher id: random, so two Live tabs of one person count as two watchers. */
export function liveWatcherId(): string {
  if (!watcherId) watcherId = crypto.randomUUID();
  return watcherId;
}

/**
 * Keeps a Tutors Live feed going alongside its Realtime subscription. Every 60 seconds (and at once) it
 * reports this tab as a watcher of `topic`, which is what makes the reader's server publish to it. When
 * the day's budget is paused, or the report fails (the function missing before its migration, the
 * database unreachable), nothing will be published, so it reads the stored activity instead and hands
 * each record, oldest first, to `onRecord`.
 * @returns a function that stops the reports and reads
 */
export function watchLiveFeed(topic: Topic, readStored: (sinceIso: string) => Promise<TutorsConnectLatestRow[] | null>, onRecord: (record: LoRecord) => void): () => void {
  let stopped = false;
  const tick = async () => {
    const tier = await watchLiveTopic(topic, liveWatcherId());
    if (stopped || (tier !== null && tier !== "paused")) return;
    const rows = await readStored(new Date(Date.now() - LIVE_STORED_WINDOW_MS).toISOString());
    if (stopped || !rows) return;
    for (const row of [...rows].reverse()) onRecord(row.payload as unknown as LoRecord);
  };
  const timer = setInterval(() => void tick(), LIVE_WATCH_MS);
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
