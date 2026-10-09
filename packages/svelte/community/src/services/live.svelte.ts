import type { RealtimeChannel } from "@supabase/supabase-js";
import { env } from "$env/dynamic/public";
import { refreshLoRecord } from "./presence.svelte.ts";
import { rune } from "@tutors/runes";
import { LoRecord, type LiveService } from "../types.svelte.ts";
import { supabase } from "../utils/supabase-client.ts";

const BROADCAST_CONFIG = { config: { broadcast: { self: true } } };

let channelAll: RealtimeChannel | null = null;
let globalChannelRemoval: Promise<unknown> | null = null;

export const liveService: LiveService = {
  listeningForCourse: rune<string>(""),
  coursesOnline: rune<LoRecord[]>([]),
  studentsOnline: rune<LoRecord[]>([]),

  studentEventMap: new Map<string, LoRecord>(),
  courseEventMap: new Map<string, LoRecord>(),

  channelCourse: null,
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
    if (globalChannelRemoval) await globalChannelRemoval;
    if (!this.listeningAll || channelAll) return;

    channelAll = supabase.channel("tutors-all-course-access", BROADCAST_CONFIG).on("broadcast", { event: "lo-event" }, this.broadcastListener.bind(this)).subscribe();
  },

  stopGlobalPresenceService() {
    if (channelAll && supabase) globalChannelRemoval = supabase.removeChannel(channelAll);
    channelAll = null;
    this.listeningAll = false;
    this.coursesOnline.value = [];
    this.studentsOnline.value = [];
    this.courseEventMap.clear();
    this.studentEventMap.clear();
  },

  startCoursePresenceListener(courseId: string) {
    if (env.PUBLIC_ANON_MODE === "TRUE" || !supabase) return;
    if (this.channelCourse && this.listeningForCourse.value === courseId) return;

    if (this.channelCourse) {
      supabase.removeChannel(this.channelCourse);
    }

    this.listeningForCourse.value = courseId;
    this.studentsOnline.value = [];
    this.studentEventMap.clear();

    this.channelCourse = supabase.channel(courseId, BROADCAST_CONFIG).on("broadcast", { event: "lo-event" }, this.studentListener.bind(this)).subscribe();
  }
};
