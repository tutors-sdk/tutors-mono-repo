/**
 * Live presence state for Tutors Live: which courses and students are active now, from the Realtime
 * lo-event broadcasts plus the stored-activity fallback in live-feed.ts. Used by the live app's page and the
 * ui-components time views. Does nothing in anonymous mode (PUBLIC_ANON_MODE=TRUE) or without Supabase.
 */
import * as env from "$app/env/public";
import { topics, type Subscription } from "@tutors/realtime";
import { refreshLoRecord } from "./presence.svelte.ts";
import { rune } from "@tutors/runes";
import { LoRecord, type LiveService } from "../types.svelte.ts";
import { getTutorsConnectRecentLos, getTutorsConnectRecentLosByCourseId, supabase } from "../utils/supabase-client.ts";
import { watchLiveFeed } from "./live-feed.ts";
import { realtime } from "./realtime.ts";

const RECEIVE_OWN = { self: true };

let globalSubscription: Subscription | null = null;
/** Stop the watcher reports (and stored-activity reads) of the platform feed and of the course feed. */
let stopGlobalFeed: (() => void) | null = null;
let stopCourseFeed: (() => void) | null = null;

export const liveService: LiveService = {
  listeningForCourse: rune<string>(""),
  coursesOnline: rune<LoRecord[]>([]),
  studentsOnline: rune<LoRecord[]>([]),

  studentEventMap: new Map<string, LoRecord>(),
  courseEventMap: new Map<string, LoRecord>(),

  courseSubscription: null,
  listeningAll: false,

  studentListener(payload: { type: string; event: string; [key: string]: any }) {
    const data = payload.payload as any;
    if (!data?.user?.id) return;

    const studentEvent = this.studentEventMap.get(data.user.id);
    if (!studentEvent) {
      const latestLo = new LoRecord(data);
      this.studentsOnline.value.push(latestLo);
      this.studentEventMap.set(data.user.id, latestLo);
    } else {
      refreshLoRecord(studentEvent, data);
    }
  },

  courseListener(payload: { type: string; event: string; [key: string]: any }) {
    const data = payload.payload as any;
    if (!data?.courseId) return;

    const courseEvent = this.courseEventMap.get(data.courseId);
    if (!courseEvent) {
      const latestLo = new LoRecord(data);
      this.coursesOnline.value.push(latestLo);
      this.courseEventMap.set(data.courseId, latestLo);
    } else {
      refreshLoRecord(courseEvent, data);
    }
  },

  broadcastListener(payload: { type: string; event: string; [key: string]: any }) {
    this.courseListener(payload);
    this.studentListener(payload);
  },

  async startGlobalPresenceService() {
    if (this.listeningAll) return;
    if (env.PUBLIC_ANON_MODE === "TRUE" || !supabase) return;

    this.listeningAll = true;
    globalSubscription = realtime.subscribe(
      topics.platformActivity(),
      { events: ["lo-event"], onMessage: (event, payload) => this.broadcastListener({ type: "broadcast", event, payload }) },
      RECEIVE_OWN
    );
    stopGlobalFeed = watchLiveFeed(topics.platformActivity(), getTutorsConnectRecentLos, (record) =>
      this.broadcastListener({ type: "broadcast", event: "lo-event", payload: record })
    );
  },

  stopGlobalPresenceService() {
    stopGlobalFeed?.();
    stopGlobalFeed = null;
    void globalSubscription?.close();
    globalSubscription = null;
    this.listeningAll = false;
    this.coursesOnline.value = [];
    this.studentsOnline.value = [];
    this.courseEventMap.clear();
    this.studentEventMap.clear();
  },

  startCoursePresenceListener(courseId: string) {
    if (env.PUBLIC_ANON_MODE === "TRUE" || !supabase) return;
    if (this.courseSubscription && this.listeningForCourse.value === courseId) return;

    void this.courseSubscription?.close();
    stopCourseFeed?.();

    this.listeningForCourse.value = courseId;
    this.studentsOnline.value = [];
    this.studentEventMap.clear();

    this.courseSubscription = realtime.subscribe(
      topics.courseActivity(courseId),
      { events: ["lo-event"], onMessage: (event, payload) => this.studentListener({ type: "broadcast", event, payload }) },
      RECEIVE_OWN
    );
    stopCourseFeed = watchLiveFeed(
      topics.courseActivity(courseId),
      (since) => getTutorsConnectRecentLosByCourseId(courseId, since),
      (record) => this.studentListener({ type: "broadcast", event: "lo-event", payload: record })
    );
  }
};
