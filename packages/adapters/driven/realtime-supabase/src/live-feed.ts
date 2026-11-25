import type { Topic } from "@tutors/application";
import type { PresenceEvent, StoredPresence } from "@tutors/domain/presence";

/** How often a Tutors Live tab reports itself as a watcher, and reads stored activity while it must. */
export const LIVE_WATCH_MS = 60 * 1000;
/** How far back a stored-activity read looks: two reports, so a missed tick loses nothing. */
export const LIVE_STORED_WINDOW_MS = 2 * 60 * 1000;

/** How much of the day's Live Realtime budget is spent: under 70%, from 70%, from 90% (supabase/migrations/20261016_realtime_live_budget.sql). */
export type LiveBudgetTier = "normal" | "slow" | "paused";

let watcherId = "";

/** This tab's watcher id: random, so two Live tabs of one person count as two watchers. */
export function liveWatcherId(): string {
  if (!watcherId) watcherId = crypto.randomUUID();
  return watcherId;
}

/** What a live feed reads and reports through: the database's watcher registration and its stored activity. */
export type LiveFeedSource = {
  /** Reports this tab as a watcher of a topic; the day's budget tier, or null when the report failed. */
  watch(topic: Topic, watcher: string): Promise<LiveBudgetTier | null>;
  /** The stored activity since an instant, newest first; null when the read failed. */
  readStored(sinceIso: string): Promise<StoredPresence[] | null>;
};

/**
 * Keeps a Tutors Live feed going alongside its Realtime subscription. Every 60 seconds (and at once) it
 * reports this tab as a watcher of `topic`, which is what makes the reader's server publish to it. When
 * the day's budget is paused, or the report fails (the function missing before its migration, the
 * database unreachable), nothing will be published, so it reads the stored activity instead and hands
 * each record, oldest first, to `onRecord`.
 * @returns a function that stops the reports and reads
 */
export function watchLiveFeed(topic: Topic, source: LiveFeedSource, onRecord: (record: PresenceEvent) => void): () => void {
  let stopped = false;
  const tick = async () => {
    const tier = await source.watch(topic, liveWatcherId());
    if (stopped || (tier !== null && tier !== "paused")) return;
    const rows = await source.readStored(new Date(Date.now() - LIVE_STORED_WINDOW_MS).toISOString());
    if (stopped || !rows) return;
    for (const row of [...rows].reverse()) onRecord(row.payload as PresenceEvent);
  };
  const timer = setInterval(() => void tick(), LIVE_WATCH_MS);
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
