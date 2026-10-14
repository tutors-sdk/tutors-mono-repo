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
 * on, or a new entry goes to the front.
 */
export function recordCourseVisit(visits: CourseVisit[], course: Course, now: Date): CourseVisit[] {
  const visit = visits.find((c) => c.id === course.courseId);
  if (visit) {
    visit.visits = (visit.visits ?? 0) + 1;
    visit.lastVisit = now.toISOString();
    return visits;
  }
  return [courseVisitOf(course, now), ...visits];
}

/**
 * Course ids the catalogue never counts: Netlify branch and preview deploys of a course site.
 */
export function isCatalogueCourseId(courseId: string): boolean {
  const invalidPatterns = /^(main--|master--|deploy-preview--)|-{2}/;
  return !invalidPatterns.test(courseId);
}
