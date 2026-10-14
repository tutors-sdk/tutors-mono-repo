import type { Course, Lo, TutorsId } from "@tutors/domain/course";
import { keepOnRoster, learnerDisplay, presenceEvent, refreshPresence, ROSTER_REFRESH_MS, type PresenceEvent } from "@tutors/domain/presence";
import { courseRoster, sharePresence } from "@tutors/application";
import type { Unsubscribe } from "@tutors/application/ports";
import log from "@tutors/logger";
import { adapters } from "../../adapters.ts";
import { rune } from "../../index.svelte.ts";
import { LoRecord, type PresenceService } from "../types.svelte.ts";

/**
 * The reader's online list is read from stored activity, not delivered live. A course channel
 * delivers every student's page view to every other student, so its cost grows with the square of the
 * class; reading the latest-activity table once a minute grows with the class.
 */
let rosterTimer: ReturnType<typeof setInterval> | null = null;
/** Bumped on every load and stop, so a slow response for a course already left is dropped. */
let rosterGeneration = 0;
/** The student this browser reports as; kept on the list even when their stored row has aged out. */
let selfId = "";
let unsubscribe: Unsubscribe | null = null;

export const presenceService: PresenceService = {
  listening: false,
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
    if (adapters().anonymous) return;
    if (this.listeningTo === courseId && this.listening) return;

    this.stopPresenceListener();
    this.listeningTo = courseId;
    this.listening = true;
    unsubscribe = adapters().presence.subscribe((event) => this.studentListener({ type: "broadcast", event: "lo-event", payload: event }), courseId);
  },

  async startCourseRoster(courseId: string) {
    if (adapters().anonymous) return;
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
    const present = await courseRoster({ presence: adapters().presence, clock: adapters().clock })(courseId);
    // A failed read keeps the last list rather than emptying it until the next refresh.
    if (!present || generation !== rosterGeneration || this.listeningTo !== courseId) return;

    for (const [id, record] of present) {
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

    const recent = new Set(present.keys());
    const kept = new Set(keepOnRoster(this.studentEventMap.keys(), recent, selfId));
    if (kept.size !== this.studentsOnline.value.length) {
      for (const [id] of this.studentEventMap) {
        if (!kept.has(id)) this.studentEventMap.delete(id);
      }
      this.studentsOnline.value = this.studentsOnline.value.filter((lo) => kept.has(lo.user!.id));
    }
  },

  stopPresenceListener() {
    if (rosterTimer) clearInterval(rosterTimer);
    rosterTimer = null;
    rosterGeneration++;
    unsubscribe?.();
    unsubscribe = null;
    this.listening = false;
    this.listeningTo = "";
    this.studentsOnline.value = [];
    this.studentEventMap.clear();
  },

  sendLoEvent(course: Course, lo: Lo, student: TutorsId) {
    if (adapters().anonymous) return;

    const user = learnerDisplay(student, getTutorsTimeId());
    selfId = user.id;
    // This browser hears its own move at once, whatever becomes of the stored row and the other browsers.
    this.studentListener({ type: "broadcast", event: "lo-event", payload: presenceEvent(course, lo, user) });
    const share = sharePresence({ presence: adapters().presence, publish: adapters().publisher.publish.bind(adapters().publisher) });
    share(course, lo, user).catch((error) => log.warn("Sharing presence failed; the local list already moved:", error));
  }
};

export function refreshLoRecord(loEvent: LoRecord, nextLoEvent: LoRecord | PresenceEvent) {
  refreshPresence(loEvent as Partial<PresenceEvent>, nextLoEvent as PresenceEvent);
}

function generateTutorsTimeId() {
  return crypto.randomUUID();
}

/** The anonymous per-browser id a student who does not share is shown under. */
function getTutorsTimeId() {
  if (!window.localStorage.tutorsTimeId) {
    window.localStorage.tutorsTimeId = generateTutorsTimeId();
  }
  return window.localStorage.tutorsTimeId;
}
