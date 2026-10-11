import { env } from "$env/dynamic/public";

import type { Course, Lo } from "@tutors/tutors-model-lib";
import { rune } from "@tutors/runes";
import { LoRecord, type LoUser, type PresenceService } from "../types.svelte.ts";
import type { TutorsId } from "@tutors/tutors-model-lib";
import { supabase, upsertTutorsConnectLatestLo } from "../utils/supabase-client.ts";
import log from "@tutors/logger";

const BROADCAST_CONFIG = { config: { broadcast: { self: false } } };
let courseChannelRemoval: Promise<unknown> | null = null;

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

  stopPresenceListener() {
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
    const message = { type: "broadcast" as const, event: "lo-event", payload: loRecord };
    this.studentListener(message);
    try {
      const channel = this.listeningTo === course.courseId ? this.channelCourse : null;
      if (channel) {
        void channel.send(message);
      } else {
        // Navigation can report activity before the old course channel has finished leaving.
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
