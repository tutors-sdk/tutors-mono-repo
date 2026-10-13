import * as env from "$app/env/public";

import type { Course, Lo } from "@tutors/tutors-model-lib";
import { rune } from "@tutors/runes";
import { LoRecord, type LoUser, type PresenceService } from "../types.svelte.ts";
import type { TutorsId } from "@tutors/tutors-model-lib";
import { getTutorsConnectRecentLosByCourseId, supabase, upsertTutorsConnectLatestLo } from "../utils/supabase-client.ts";
import log from "@tutors/logger";

const BROADCAST_CONFIG = { config: { broadcast: { self: false } } };
let courseChannelRemoval: Promise<unknown> | null = null;

/**
 * The reader's online list is read from stored activity, not delivered over Realtime. A course channel
 * delivers every student's page view to every other student, so its cost grows with the square of the
 * class; reading the latest-activity table once a minute grows with the class.
 */
const ROSTER_REFRESH_MS = 60 * 1000;
const ROSTER_WINDOW_MS = 5 * 60 * 1000;
let rosterTimer: ReturnType<typeof setInterval> | null = null;
/** Bumped on every load and stop, so a slow response for a course already left is dropped. */
let rosterGeneration = 0;
/** The student this browser reports as; kept on the list even when their stored row has aged out. */
let selfId = "";

export const presenceService: PresenceService = {
  channelAll: null,
  channelCourse: null,
  listeningTo: "",
  studentsOnline: rune<LoRecord[]>([]),
  studentEventMap: new Map<string, LoRecord>(),

  studentListener(payload: { type: string; event: string; [key: string]: any }) {
    const nextCourseEvent = payload.payload as LoRecord;
    if (!nextCourseEvent?.courseId || !nextCourseEvent.user?.id) return;

    if (nextCourseEvent.courseId === this.listeningTo) {
      const studentEvent = this.studentEventMap.get(nextCourseEvent.user!.id);
      if (!studentEvent) {
        const latestLo = new LoRecord(nextCourseEvent);
        this.studentsOnline.value.push(latestLo);
        this.studentEventMap.set(nextCourseEvent.user!.id, latestLo);
      } else {
        refreshLoRecord(studentEvent, nextCourseEvent);
      }
    }
  },

  /** Publish-only: joining here multiplies billed platform-wide deliveries by every reader.
   * Only Tutors Live's landing page subscribes to this feed.
   */
  connectToAllCourseAccess(): void {
    if (env.PUBLIC_ANON_MODE === "TRUE" || !supabase) return;
    if (this.channelAll) return;
    this.channelAll = supabase.channel("tutors-all-course-access", BROADCAST_CONFIG);
  },

  async startPresenceListener(courseId: string) {
    if (env.PUBLIC_ANON_MODE === "TRUE" || !supabase) return;
    if (this.listeningTo === courseId) return;

    this.stopPresenceListener();
    this.listeningTo = courseId;
    // Supabase reuses channels by topic, so wait until the previous instance has left.
    if (courseChannelRemoval) await courseChannelRemoval;
    if (this.listeningTo !== courseId || this.channelCourse) return;

    this.channelCourse = supabase.channel(courseId, BROADCAST_CONFIG).on("broadcast", { event: "lo-event" }, this.studentListener.bind(this)).subscribe();
  },

  async startCourseRoster(courseId: string) {
    if (env.PUBLIC_ANON_MODE === "TRUE" || !supabase) return;
    if (this.listeningTo === courseId && rosterTimer) return;

    this.stopPresenceListener();
    this.listeningTo = courseId;
    rosterTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void this.refreshCourseRoster();
    }, ROSTER_REFRESH_MS);
    await this.refreshCourseRoster();
  },

  async refreshCourseRoster() {
    const courseId = this.listeningTo;
    if (!courseId || !rosterTimer) return;

    const generation = ++rosterGeneration;
    const since = new Date(Date.now() - ROSTER_WINDOW_MS).toISOString();
    const rows = await getTutorsConnectRecentLosByCourseId(courseId, since);
    if (generation !== rosterGeneration || this.listeningTo !== courseId) return;

    const recent = new Set<string>();
    for (const row of rows) {
      const record = row.payload as unknown as LoRecord;
      const id = record?.user?.id;
      if (!id || record.courseId !== courseId) continue;
      recent.add(id);
      const existing = this.studentEventMap.get(id);
      if (!existing) {
        const latestLo = new LoRecord(record);
        this.studentsOnline.value.push(latestLo);
        this.studentEventMap.set(id, latestLo);
      } else if (id !== selfId) {
        // This browser's own record is updated locally as the student moves, ahead of the stored row.
        refreshLoRecord(existing, record);
      }
    }

    const kept = this.studentsOnline.value.filter((lo) => recent.has(lo.user!.id) || lo.user!.id === selfId);
    if (kept.length !== this.studentsOnline.value.length) {
      for (const [id] of this.studentEventMap) {
        if (!recent.has(id) && id !== selfId) this.studentEventMap.delete(id);
      }
      this.studentsOnline.value = kept;
    }
  },

  stopPresenceListener() {
    if (rosterTimer) clearInterval(rosterTimer);
    rosterTimer = null;
    rosterGeneration++;
    if (this.channelCourse && supabase) courseChannelRemoval = supabase.removeChannel(this.channelCourse);
    this.channelCourse = null;
    this.listeningTo = "";
    this.studentsOnline.value = [];
    this.studentEventMap.clear();
  },

  sendLoEvent(course: Course, lo: Lo, student: TutorsId) {
    if (env.PUBLIC_ANON_MODE === "TRUE" || !supabase) return;

    const loRecord: LoRecord = {
      courseId: course.courseId,
      courseUrl: course.courseUrl,
      img: lo.img,
      title: lo.title,
      courseTitle: course.title,
      loRoute: lo.route,
      user: getUser(student),
      type: lo.type,
      isPrivate: (course.properties?.private as unknown as number) === 1
    };
    if (lo.icon) {
      loRecord.icon = lo.icon;
    }

    // Publish by HTTP because the global channel is deliberately never joined.
    try {
      void this.channelAll?.httpSend("lo-event", loRecord).catch((error) => log.error("Broadcast to tutors-all-course-access failed:", error));
    } catch (error) {
      log.error("Broadcast to tutors-all-course-access failed:", error);
    }
    selfId = loRecord.user?.id ?? "";
    const message = { type: "broadcast" as const, event: "lo-event", payload: loRecord };
    this.studentListener(message);
    try {
      const channel = this.listeningTo === course.courseId ? this.channelCourse : null;
      if (channel) {
        void channel.send(message);
      } else {
        // The reader never joins the course channel; Tutors Live's course page is the only subscriber.
        void supabase
          .channel(course.courseId, BROADCAST_CONFIG)
          .httpSend("lo-event", loRecord)
          .catch((error) => log.error("Broadcast to course failed:", error));
      }
    } catch (error) {
      log.error("Broadcast to course failed:", error);
    }

    void upsertTutorsConnectLatestLo(loRecord);
  }
};

export function refreshLoRecord(loEvent: LoRecord, nextLoEvent: LoRecord) {
  loEvent.loRoute = nextLoEvent.loRoute;
  loEvent.title = nextLoEvent.title;
  loEvent.type = nextLoEvent.type;
  loEvent.user = nextLoEvent.user;
  if (nextLoEvent.icon) {
    loEvent.icon = nextLoEvent.icon;
    loEvent.img = undefined;
  } else {
    loEvent.img = nextLoEvent.img;
    loEvent.icon = undefined;
  }
}

function getUser(tutorsId: TutorsId): LoUser {
  const user: LoUser = {
    fullName: "Anon",
    avatar: "https://tutors.dev/logo.svg",
    id: getTutorsTimeId(),
    sentiment: "neutral"
  };
  if (tutorsId.share) {
    user.fullName = tutorsId.name;
    user.avatar = tutorsId.image;
    user.id = tutorsId.login;
    user.sentiment = tutorsId.sentiment ?? "neutral";
  }
  return user;
}

function generateTutorsTimeId() {
  return crypto.randomUUID();
}

function getTutorsTimeId() {
  if (!window.localStorage.tutorsTimeId) {
    window.localStorage.tutorsTimeId = generateTutorsTimeId();
  }
  return window.localStorage.tutorsTimeId;
}
