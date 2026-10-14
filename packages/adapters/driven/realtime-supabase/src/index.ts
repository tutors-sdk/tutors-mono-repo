/**
 * Presence over Supabase Realtime: the application's PresencePort. Publishing is by HTTP, so a
 * reader never joins a channel (joining multiplies billed deliveries by every reader); only the
 * live app subscribes. The latest snapshot per learner is kept in `tutors-connect-latest`, which
 * is what the reader's online list reads once a minute instead of listening.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { PresenceEvent, StoredPresence } from "@tutors/domain/presence";
import type { PresencePort, Unsubscribe } from "@tutors/application/ports";
import log from "@tutors/logger";

export const ALL_COURSES_CHANNEL = "tutors-all-course-access";
const LO_EVENT = "lo-event";
const BROADCAST_CONFIG = { config: { broadcast: { self: false } } };

type Subscription = { channel: RealtimeChannel | null; removal: Promise<unknown> | null };

/**
 * `now` stamps the stored snapshot; it is the Clock port's value so the harness can freeze it.
 */
export function supabasePresence(client: SupabaseClient, now: () => Date = () => new Date()): PresencePort {
  /** One live subscription per topic, so a publish to a subscribed course can use its joined channel. */
  const subscriptions = new Map<string, Subscription>();
  let allCoursesChannel: RealtimeChannel | null = null;

  function publishToAllCourses(event: PresenceEvent): void {
    // Publish by HTTP because the global channel is deliberately never joined.
    try {
      allCoursesChannel ??= client.channel(ALL_COURSES_CHANNEL, BROADCAST_CONFIG);
      void allCoursesChannel.httpSend(LO_EVENT, event).catch((error) => log.error("Broadcast to tutors-all-course-access failed:", error));
    } catch (error) {
      log.error("Broadcast to tutors-all-course-access failed:", error);
    }
  }

  function publishToCourse(event: PresenceEvent): void {
    try {
      const joined = subscriptions.get(event.courseId)?.channel;
      if (joined) {
        void joined.send({ type: "broadcast", event: LO_EVENT, payload: event });
      } else {
        // The reader never joins the course channel; Tutors Live's course page is the only subscriber.
        void client
          .channel(event.courseId, BROADCAST_CONFIG)
          .httpSend(LO_EVENT, event)
          .catch((error) => log.error("Broadcast to course failed:", error));
      }
    } catch (error) {
      log.error("Broadcast to course failed:", error);
    }
  }

  async function storeLatest(event: PresenceEvent): Promise<void> {
    const courseId = event.courseId?.trim();
    const studentId = event.user?.id?.trim();
    if (!courseId || !studentId) return;
    const { error } = await client.from("tutors-connect-latest").upsert(
      { course_id: courseId, student_id: studentId, payload: event, received_at: now().toISOString() },
      { onConflict: "course_id,student_id" }
    );
    if (error) {
      log.error("upsertTutorsConnectLatestLo failed:", error);
    }
  }

  return {
    async publish(event) {
      publishToAllCourses(event);
      publishToCourse(event);
      await storeLatest(event);
    },

    subscribe(listener, courseId): Unsubscribe {
      const topic = courseId ?? ALL_COURSES_CHANNEL;
      const existing = subscriptions.get(topic) ?? { channel: null, removal: null };
      let active = true;
      const subscription: Subscription = { channel: null, removal: null };
      subscriptions.set(topic, subscription);

      const join = async () => {
        // Supabase reuses channels by topic, so wait until the previous instance has left.
        if (existing.removal) await existing.removal;
        if (!active || subscriptions.get(topic) !== subscription) return;
        subscription.channel = client
          .channel(topic, BROADCAST_CONFIG)
          .on("broadcast", { event: LO_EVENT }, (message) => {
            const event = (message as { payload?: PresenceEvent }).payload;
            if (event) listener(event);
          })
          .subscribe();
      };
      void join();

      return () => {
        if (!active) return;
        active = false;
        if (subscription.channel) subscription.removal = client.removeChannel(subscription.channel);
        subscription.channel = null;
        if (subscriptions.get(topic) === subscription && !subscription.removal) subscriptions.delete(topic);
      };
    },

    async recent(courseId, sinceIso): Promise<StoredPresence[] | null> {
      const id = courseId?.trim();
      if (!id) return [];
      const { data, error } = await client
        .from("tutors-connect-latest")
        .select("course_id, student_id, payload, received_at")
        .eq("course_id", id)
        .gte("received_at", sinceIso)
        .order("received_at", { ascending: false });
      if (error) {
        log.error("getTutorsConnectRecentLosByCourseId failed:", error);
        return null;
      }
      return (data ?? []) as StoredPresence[];
    }
  };
}
