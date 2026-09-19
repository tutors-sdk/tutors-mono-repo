import type { Service } from "./catalogue.ts";

/** Every event kind published on the bus, in the order a session produces them. */
export const EVENT_TYPES = [
  "session.started",
  "session.heartbeat",
  "course.opened",
  "lo.viewed",
  "service.used",
  "session.ended"
] as const;

/** An event kind. */
export type LiveEventType = (typeof EVENT_TYPES)[number];

/**
 * Fields every event carries.
 *
 * `sid` is a random token regenerated daily and never derived from identity;
 * `ts` is ISO 8601 and is coarsened to the minute before it reaches storage.
 */
interface LiveEventBase {
  ts: string;
  sid: string;
  course: string;
}

/** A session begins. `uid` is present only for a logged-in user who opted in. */
export interface SessionStarted extends LiveEventBase {
  type: "session.started";
  uid?: string;
}

/** Proof of life: the session is still open, optionally on a named learning object. */
export interface SessionHeartbeat extends LiveEventBase {
  type: "session.heartbeat";
  lo?: string;
}

/** A course was opened. The first one in a session also starts the session. */
export interface CourseOpened extends LiveEventBase {
  type: "course.opened";
}

/** A learning object was opened. */
export interface LoViewed extends LiveEventBase {
  type: "lo.viewed";
  lo: string;
  loType: string;
}

/** A catalogued service was used within the session. */
export interface ServiceUsed extends LiveEventBase {
  type: "service.used";
  service: Service;
}

/** A session closed, with the duration the client observed. */
export interface SessionEnded extends LiveEventBase {
  type: "session.ended";
  durationSec: number;
}

/** Anything published on `tutors.live.<type>`. */
export type LiveEvent = SessionStarted | SessionHeartbeat | CourseOpened | LoViewed | ServiceUsed | SessionEnded;

/** The bus subject an event is published on. */
export function subjectFor(type: LiveEventType): string {
  return `tutors.live.${type}`;
}

/** The subject wildcard a consumer subscribes to for every event kind. */
export const SUBJECT_WILDCARD = "tutors.live.*";
