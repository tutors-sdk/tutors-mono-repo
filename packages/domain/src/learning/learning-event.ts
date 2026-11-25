/**
 * Building learning events from what the reader knows: the course, the learning object on
 * screen and the instant. The route a page load is recorded against is the learning object's
 * route, or, inside a lab or notebook, the course-level route with the step id appended.
 */
import type { Course, Lo } from "../course/types/index.ts";
import type { LoType } from "../course/vocabulary.ts";
import { localYyyyMmDd } from "./local-day.ts";
import type { LearningEvent, PageLoadEvent, TickEvent } from "./events.ts";

/**
 * The route a learning object is recorded under. With a step id (a lab step, a notebook cell),
 * the first three segments of the route are kept and the step id appended, so every step of a
 * lab is its own record under the lab's route.
 */
export function learningObjectRoute(lo: Lo, stepId?: string): string {
  if (stepId) {
    const trimmedTargetRoute = lo.route.split("/").slice(0, 3).join("/");
    return `${trimmedTargetRoute}/${stepId}`;
  }
  return lo.route;
}

/** The page-load event for a learning object opened at `now`. */
export function pageLoadEvent(course: Course, lo: Lo, now: Date, stepId?: string): PageLoadEvent {
  return {
    kind: "page-load",
    courseId: course.courseId,
    loId: learningObjectRoute(lo, stepId),
    loType: lo.type as LoType,
    day: localYyyyMmDd(now)
  };
}

/** The "still reading" tick at `now`, against the learning object on screen when there is one. */
export function tickEvent(course: Course, lo: Lo | null, now: Date, stepId?: string): TickEvent {
  return {
    kind: "tick",
    courseId: course.courseId,
    loId: lo?.route ? learningObjectRoute(lo, stepId) : null,
    day: localYyyyMmDd(now)
  };
}

/**
 * Identity of a learning event for de-duplication: the reader reports once per page a learner
 * arrives at, and a repeat of the same payload with no navigation behind it is dropped.
 */
export function learningEventIdentity(event: LearningEvent, learner: { login?: string | null; sentiment?: string | null; share?: string | null }): string {
  return [event.loId ?? "", event.courseId, learner.login ?? "", learner.sentiment ?? "", learner.share ?? ""].join("|");
}
