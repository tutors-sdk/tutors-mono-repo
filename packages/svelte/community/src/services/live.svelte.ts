import * as env from "$app/env/public";
import { topics, type Subscription } from "@tutors/realtime";
import { refreshLoRecord } from "./presence.svelte.ts";
import { rune } from "@tutors/runes";
import { LoRecord, type LiveService } from "../types.svelte.ts";
import { supabase } from "../utils/supabase-client.ts";
import { realtime } from "./realtime.ts";

const RECEIVE_OWN = { self: true };

let globalSubscription: Subscription | null = null;

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
  },

  stopGlobalPresenceService() {
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

    this.listeningForCourse.value = courseId;
    this.studentsOnline.value = [];
    this.studentEventMap.clear();

    this.courseSubscription = realtime.subscribe(
      topics.courseActivity(courseId),
      { events: ["lo-event"], onMessage: (event, payload) => this.studentListener({ type: "broadcast", event, payload }) },
      RECEIVE_OWN
    );
  }
};
