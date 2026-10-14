import type { Unsubscribe } from "@tutors/application/ports";
import { adapters } from "../../adapters.ts";
import { refreshLoRecord } from "./presence.svelte.ts";
import { rune } from "../../index.svelte.ts";
import { LoRecord, type LiveService } from "../types.svelte.ts";

let stopGlobal: Unsubscribe | null = null;
let stopCourse: Unsubscribe | null = null;

export const liveService: LiveService = {
  listeningForCourse: rune<string>(""),
  coursesOnline: rune<LoRecord[]>([]),
  studentsOnline: rune<LoRecord[]>([]),

  studentEventMap: new Map<string, LoRecord>(),
  courseEventMap: new Map<string, LoRecord>(),

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
    if (adapters().anonymous) return;

    this.listeningAll = true;
    stopGlobal = adapters().presence.subscribe((event) => this.broadcastListener({ type: "broadcast", event: "lo-event", payload: event }));
  },

  stopGlobalPresenceService() {
    stopGlobal?.();
    stopGlobal = null;
    this.listeningAll = false;
    this.coursesOnline.value = [];
    this.studentsOnline.value = [];
    this.courseEventMap.clear();
    this.studentEventMap.clear();
  },

  startCoursePresenceListener(courseId: string) {
    if (adapters().anonymous) return;
    if (stopCourse && this.listeningForCourse.value === courseId) return;

    stopCourse?.();

    this.listeningForCourse.value = courseId;
    this.studentsOnline.value = [];
    this.studentEventMap.clear();

    stopCourse = adapters().presence.subscribe((event) => this.studentListener({ type: "broadcast", event: "lo-event", payload: event }), courseId);
  },

  stopCoursePresenceListener() {
    stopCourse?.();
    stopCourse = null;
    this.listeningForCourse.value = "";
    this.studentsOnline.value = [];
    this.studentEventMap.clear();
  }
};
