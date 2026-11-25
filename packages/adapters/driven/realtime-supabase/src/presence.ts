/**
 * The watching half of the application's PresencePort over Supabase. A browser never publishes over
 * Realtime: the reader's server does (`./live-activity.server.ts`), and only to the feeds a Tutors
 * Live tab reports it is watching, within the day's budget. So subscribing here joins the topic
 * through the gateway and keeps the watcher report going; while the budget is paused, or the report
 * fails, the stored activity is read instead. The reader's own online list never listens: it reads
 * `recent` once a minute, which grows with the class rather than with its square.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRealtimeGateway, topics, type RealtimeGateway } from "@tutors/application";
import type { PresenceFeed, Unsubscribe } from "@tutors/application/ports";
import type { PresenceEvent, StoredPresence } from "@tutors/domain/presence";
import log from "@tutors/logger";
import { supabaseRealtimeAdapter } from "./broker.ts";
import { watchLiveFeed, type LiveBudgetTier } from "./live-feed.ts";

const LO_EVENT = "lo-event";
/** A Tutors Live tab hears what the server publishes for it, its own reports included. */
const RECEIVE_OWN = { self: true };
const LATEST_COLUMNS = "course_id, student_id, payload, received_at";

/** The feed, and the tab's one gateway so a caller can read its counts or reset it on sign-out. */
export type SupabasePresence = PresenceFeed & { gateway: RealtimeGateway };

export function supabasePresence(client: SupabaseClient): SupabasePresence {
  const gateway = createRealtimeGateway({
    adapter: supabaseRealtimeAdapter(client),
    onError: (failure, topic, error) => {
      if (failure === "send") log.error("Realtime broadcast failed:", topic, error);
      else log.error("Leaving a Realtime channel failed:", topic, error);
    }
  });

  /** Reports this tab as a watcher of a topic, so the reader's server publishes to it. */
  async function watch(topic: string, watcher: string): Promise<LiveBudgetTier | null> {
    const { data, error } = await client.rpc("realtime_watch", { p_topic: topic, p_watcher: watcher });
    if (error) {
      log.warn("realtime_watch failed:", error);
      return null;
    }
    const tier = (data as { tier?: string } | null)?.tier;
    return tier === "normal" || tier === "slow" || tier === "paused" ? tier : null;
  }

  async function recent(courseId: string, sinceIso: string): Promise<StoredPresence[] | null> {
    const id = courseId?.trim();
    if (!id) return [];
    const { data, error } = await client.from("tutors-connect-latest").select(LATEST_COLUMNS).eq("course_id", id).gte("received_at", sinceIso).order("received_at", { ascending: false });
    if (error) {
      log.error("getTutorsConnectRecentLosByCourseId failed:", error);
      return null;
    }
    return (data ?? []) as StoredPresence[];
  }

  /** Stored snapshots across every course, at most `limit`: the platform feed while it reads stored activity. */
  async function recentEverywhere(sinceIso: string, limit = 200): Promise<StoredPresence[] | null> {
    const { data, error } = await client.from("tutors-connect-latest").select(LATEST_COLUMNS).gte("received_at", sinceIso).order("received_at", { ascending: false }).limit(limit);
    if (error) {
      log.error("getTutorsConnectRecentLos failed:", error);
      return null;
    }
    return (data ?? []) as StoredPresence[];
  }

  return {
    gateway,
    recent,

    subscribe(listener, courseId): Unsubscribe {
      const topic = courseId ? topics.courseActivity(courseId) : topics.platformActivity();
      // The gateway waits for a previous channel on this topic to finish leaving before it joins again.
      const subscription = gateway.subscribe(topic, { events: [LO_EVENT], onMessage: (_event, payload) => listener(payload as PresenceEvent) }, RECEIVE_OWN);
      const stopFeed = watchLiveFeed(topic, { watch, readStored: (since) => (courseId ? recent(courseId, since) : recentEverywhere(since)) }, listener);
      return () => {
        stopFeed();
        void subscription.close();
      };
    }
  };
}
