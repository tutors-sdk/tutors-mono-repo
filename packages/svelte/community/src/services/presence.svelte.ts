import type { RealtimeChannel } from "@supabase/supabase-js";
import { PUBLIC_ANON_MODE } from "$env/static/public";

import type { Course, Lo } from "@tutors/tutors-model-lib";
import { rune, tutorsId } from "@tutors/runes";
import { LoRecord, type LoUser, type PresenceService } from "../types.svelte.ts";
import type { TutorsId } from "@tutors/tutors-model-lib";
import { supabase, upsertTutorsConnectLatestLo } from "../utils/supabase-client.ts";

const BROADCAST_CONFIG = { config: { broadcast: { self: true } } };

export const presenceService: PresenceService = {
  channelAll: null,
  channelCourse: null,
  listeningTo: "",
  studentsOnline: rune<LoRecord[]>([]),
  studentEventMap: new Map<string, LoRecord>(),

  studentListener(payload: { payload: unknown }) {
    const nextCourseEvent = payload.payload as LoRecord;
    if (!nextCourseEvent?.courseId) return;

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

  connectToAllCourseAccess(): void {
    if (PUBLIC_ANON_MODE === "TRUE" || !supabase) return;
    this.channelAll = supabase
      .channel("tutors-all-course-access", BROADCAST_CONFIG)
      .subscribe();
  },

  startPresenceListener(courseId: string) {
    if (PUBLIC_ANON_MODE === "TRUE" || !supabase) return;

    if (this.channelCourse) {
      supabase.removeChannel(this.channelCourse);
    }

    this.studentsOnline.value = [];
    this.studentEventMap.clear();
    this.listeningTo = courseId;

    this.channelCourse = supabase
      .channel(courseId, BROADCAST_CONFIG)
      .on("broadcast", { event: "lo-event" }, this.studentListener.bind(this))
      .subscribe();
  },

  sendLoEvent(course: Course, lo: Lo, student: TutorsId) {
    if (PUBLIC_ANON_MODE === "TRUE" || !supabase) return;

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

    this.channelAll?.send({ type: "broadcast", event: "lo-event", payload: loRecord });
    if (this.listeningTo !== "") {
      this.channelCourse?.send({ type: "broadcast", event: "lo-event", payload: loRecord });
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
