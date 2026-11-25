/**
 * Who is in a course right now. The reader's online list is read from stored activity, not
 * delivered over Realtime: a course channel delivers every learner's page view to every other
 * learner, so its cost grows with the square of the class, while reading the latest-activity
 * table once a minute grows with the class.
 */
import type { Course, Lo, TutorsId } from "../course/types/index.ts";
import type { LoType } from "../course/vocabulary.ts";
import type { PresenceEvent } from "./events.ts";
import type { LearnerDisplay } from "./learner.ts";

/** How often the online list is re-read while the tab is visible. */
export const ROSTER_REFRESH_MS = 60 * 1000;
/** A learner whose latest activity is older than this has left. */
export const ROSTER_WINDOW_MS = 5 * 60 * 1000;

/** The ISO instant from which stored activity counts as present, for a read at `nowMs`. */
export function rosterSince(nowMs: number): string {
  return new Date(nowMs - ROSTER_WINDOW_MS).toISOString();
}

/** How a learner appears to others: in full when they share, otherwise anonymised under a per-browser id. */
export function learnerDisplay(tutorsId: TutorsId, anonymousId: string): LearnerDisplay {
  const user: LearnerDisplay = {
    fullName: "Anon",
    avatar: "https://tutors.dev/logo.svg",
    id: anonymousId,
    sentiment: "neutral"
  };
  if (tutorsId.share) {
    user.fullName = tutorsId.name;
    user.avatar = tutorsId.image;
    user.id = tutorsId.login;
    user.sentiment = (tutorsId.sentiment ?? "neutral") as LearnerDisplay["sentiment"];
  }
  return user;
}

/** The presence event for a learner looking at `lo` in `course`. */
export function presenceEvent(course: Course, lo: Lo, user: LearnerDisplay): PresenceEvent {
  const event: PresenceEvent = {
    courseId: course.courseId,
    courseUrl: course.courseUrl,
    img: lo.img,
    title: lo.title,
    courseTitle: course.title,
    loRoute: lo.route,
    user,
    type: lo.type as LoType,
    isPrivate: (course.properties?.private as unknown as number) === 1
  };
  if (lo.icon) {
    event.icon = lo.icon;
  }
  return event;
}

/** A stored snapshot row, as the adapter returns it. */
export type StoredPresence = { payload: unknown };

/**
 * The learners a set of stored snapshots puts in `courseId`, keyed by learner id. Rows for another
 * course, or with no learner, are ignored.
 */
export function presentLearners(rows: StoredPresence[], courseId: string): Map<string, PresenceEvent> {
  const present = new Map<string, PresenceEvent>();
  for (const row of rows) {
    const record = row.payload as PresenceEvent | null | undefined;
    const id = record?.user?.id;
    if (!id || record.courseId !== courseId) continue;
    present.set(id, record);
  }
  return present;
}

/**
 * Which learners stay on the list after a refresh: those recently active, plus this browser's own
 * learner, whose record is updated locally as they move and may be ahead of the stored row.
 */
export function keepOnRoster(ids: Iterable<string>, recent: ReadonlySet<string>, selfId: string): string[] {
  const kept: string[] = [];
  for (const id of ids) {
    if (recent.has(id) || id === selfId) kept.push(id);
  }
  return kept;
}

/** The changes one presence event makes to the record already shown for that learner. */
export function refreshPresence<T extends Partial<PresenceEvent>>(shown: T, next: PresenceEvent): T {
  shown.loRoute = next.loRoute;
  shown.title = next.title;
  shown.type = next.type;
  shown.user = next.user;
  if (next.icon) {
    shown.icon = next.icon;
    shown.img = undefined;
  } else {
    shown.img = next.img;
    shown.icon = undefined;
  }
  return shown;
}
