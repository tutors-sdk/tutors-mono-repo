import * as env from "$app/env/public";

import type { Course, Lo } from "@tutors/tutors-model-lib";
import { rune } from "@tutors/runes";
import { LoRecord, type LoUser, type PresenceService } from "../types.svelte.ts";
import type { TutorsId } from "@tutors/tutors-model-lib";
import { topics } from "@tutors/realtime";
import { getTutorsConnectRecentLosByCourseId, supabase, upsertTutorsConnectLatestLo } from "../utils/supabase-client.ts";
import { realtime } from "./realtime.ts";
import { watchLiveFeed } from "./live-feed.ts";
import log from "@tutors/logger";

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
/** Stops Tutors Live's watcher reports for the course page it shows. */
let stopLiveFeed: (() => void) | null = null;

export const presenceService: PresenceService = {
  courseSubscription: null,
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

  async startPresenceListener(courseId: string) {
    if (env.PUBLIC_ANON_MODE === "TRUE" || !supabase) return;
    if (this.listeningTo === courseId) return;

    this.stopPresenceListener();
    this.listeningTo = courseId;
    // The gateway waits for a previous channel on this topic to finish leaving before it joins again.
    this.courseSubscription = realtime.subscribe(topics.courseActivity(courseId), {
      events: ["lo-event"],
      onMessage: (event, payload) => this.studentListener({ type: "broadcast", event, payload })
    });
    stopLiveFeed = watchLiveFeed(
      topics.courseActivity(courseId),
      (since) => getTutorsConnectRecentLosByCourseId(courseId, since),
      (record) => this.studentListener({ type: "broadcast", event: "lo-event", payload: record })
    );
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
    // A failed read keeps the last list rather than emptying it until the next refresh.
    if (!rows || generation !== rosterGeneration || this.listeningTo !== courseId) return;

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
    stopLiveFeed?.();
    stopLiveFeed = null;
    if (rosterTimer) clearInterval(rosterTimer);
    rosterTimer = null;
    rosterGeneration++;
    void this.courseSubscription?.close();
    this.courseSubscription = null;
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

    selfId = loRecord.user?.id ?? "";
    this.studentListener({ type: "broadcast", event: "lo-event", payload: loRecord });
    // The browser publishes nothing over Realtime: the reader's server publishes to Tutors Live, and only
    // to the feeds a Live tab is watching, within the day's budget.
    reportLiveActivity(loRecord);
    void upsertTutorsConnectLatestLo(loRecord);
  }
};

/** The reader's server route that publishes learning events to Tutors Live (apps/reader/src/routes/api/live/activity). */
export const LIVE_ACTIVITY_ROUTE = "/api/live/activity";

/** Fire-and-forget: `keepalive` lets the request finish when the student is leaving the page. */
function reportLiveActivity(loRecord: LoRecord) {
  if (typeof fetch !== "function") return;
  try {
    void fetch(LIVE_ACTIVITY_ROUTE, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(loRecord)
    }).catch((error: unknown) => log.warn("Reporting live activity failed:", error));
  } catch (error) {
    log.warn("Reporting live activity failed:", error);
  }
}

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
