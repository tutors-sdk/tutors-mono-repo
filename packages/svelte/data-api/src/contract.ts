/**
 * The data API: every route Tutors' browser code may call for data it does not read in public, with
 * what each one takes and returns. Browser packages talk to data only through this contract (the
 * client in client.ts); the server side implements it, today in the reader
 * (apps/reader/src/routes/api, guides/SERVER-WRITES.md). The database behind it can change without
 * any browser package noticing: this layer is the seam.
 *
 * Every route identifies the caller from the session; nothing here carries a student id.
 */
import type { TutorsTimeRows } from "@tutors/tutors-time-lib";

/** POST /api/analytics: a page load, or the 30-second "still reading" tick, for the signed-in student. */
export type AnalyticsEvent =
  | { kind: "page-load"; courseId: string; loId: string; loType: string; day: string }
  | { kind: "tick"; courseId: string; loId: string | null; day: string };

/** GET /api/me: the signed-in user's stored sentiment and online status. */
export interface MyStatus {
  sentiment: string | null;
  online_status: string | null;
}

/** PUT /api/me (on sign-in) and PATCH /api/me: what the user may set about themselves. */
export interface MyStatusChange {
  sentiment?: string;
  onlineStatus?: "online" | "offline";
}

/** GET and PUT /api/profile: the signed-in user's course-visit history. */
export interface Profile<Visit = Record<string, unknown>> {
  courseVisits: Visit[];
}

/** How far a signed-in student has got in one course (Rules 0076, 0077). */
export interface CourseProgress {
  /** Learning objects the student has opened. */
  opened: number;
  /** Learning objects the course publishes: pages the reader opens, not topics, units, lab steps or links out. */
  total: number;
  /** The learning object the student opened most recently, or null before the first. */
  continueAt: { route: string; title: string } | null;
}

/** GET /api/home: progress per course in the signed-in user's profile; null where the course's host could not be read. */
export interface Home {
  courses: Record<string, CourseProgress | null>;
}

/** POST /api/courses/visit: a visit to a published course, for the public catalogue. */
export interface CourseVisitReport {
  courseId: string;
  courseRecord: Record<string, unknown>;
}

/** POST /api/presence: the learning object a student who shares presence is on. */
export interface PresenceReport {
  courseId: string;
  payload: object;
}

/** PUT /api/locks (educators only). */
export interface LockChange {
  courseId: string;
  loRoute: string;
  locked: boolean;
}

/** DELETE /api/locks (educators only). */
export interface LockRemoval {
  courseId: string;
  loRoute: string;
}

/** Which whiteboard: a learning object's shared board, or the signed-in student's own. */
export interface WhiteboardRoom {
  courseId: string;
  route: string;
  shared: boolean;
}

/** GET /api/whiteboard answers `{ scene }`. */
export interface WhiteboardScene {
  elements: unknown;
  appState: unknown;
  files: unknown;
}

/** PUT /api/whiteboard. */
export interface WhiteboardSave extends WhiteboardRoom {
  elements: unknown[];
}

/** GET /api/time/[courseId]: a course's time rows as the viewer may see them (read by the time library). */
export type TimeRows = TutorsTimeRows;
