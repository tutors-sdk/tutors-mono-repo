import type { Course, IconType } from "../course/types/index.ts";
import type { CourseVisit } from "./learner.ts";

/** The visit record a course gets in a learner's history, at `now`. */
export function courseVisitOf(course: Course, now: Date): CourseVisit {
  const visit: CourseVisit = {
    id: course.courseId,
    title: course.title,
    lastVisit: now.toISOString(),
    credits: course.properties.credits,
    visits: 1
  };
  if (course.properties.icon) {
    visit.icon = course.properties.icon as unknown as IconType;
  } else {
    visit.img = course.img;
  }
  return visit;
}

/**
 * A learner's history after visiting `course` at `now`: the existing entry's count and time move
 * on, or a new entry goes to the front. The history handed in is left as it was.
 */
export function recordCourseVisit(visits: readonly CourseVisit[], course: Course, now: Date): CourseVisit[] {
  if (!visits.some((visit) => visit.id === course.courseId)) return [courseVisitOf(course, now), ...visits];
  return visits.map((visit) => (visit.id === course.courseId ? { ...visit, visits: (visit.visits ?? 0) + 1, lastVisit: now.toISOString() } : visit));
}

/** A learner's history with one course marked, or unmarked, as a favourite. */
export function favouriteCourseVisit(visits: readonly CourseVisit[], courseId: string, favourite: boolean): CourseVisit[] {
  return visits.map((visit) => (visit.id === courseId ? { ...visit, favourite } : visit));
}

/** A learner's history without one course. */
export function forgetCourseVisit(visits: readonly CourseVisit[], courseId: string): CourseVisit[] {
  return visits.filter((visit) => visit.id !== courseId);
}

/**
 * What the public catalogue keeps about a course when someone opens it: its card, whether it is
 * private, and no visit count of its own (the catalogue counts).
 */
export function catalogueRecordOf(course: Course, now: Date): CourseVisit {
  const { visits: _visits, ...card } = courseVisitOf(course, now);
  return { ...card, private: course.isPrivate };
}

/**
 * Course ids the catalogue never counts: Netlify branch and preview deploys of a course site.
 */
export function isCatalogueCourseId(courseId: string): boolean {
  const invalidPatterns = /^(main--|master--|deploy-preview--)|-{2}/;
  return !invalidPatterns.test(courseId);
}
