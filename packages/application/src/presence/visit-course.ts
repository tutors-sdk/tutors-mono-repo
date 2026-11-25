import type { Course } from "@tutors/domain/course";
import { catalogueRecordOf, favouriteCourseVisit, forgetCourseVisit as withoutCourse, isCatalogueCourseId, recordCourseVisit, type CourseVisit } from "@tutors/domain/presence";
import type { Clock } from "../ports/clock.ts";
import type { CourseCatalogue } from "../ports/course-catalogue.ts";
import type { ProfilePort } from "../ports/profile.ts";

export type CourseVisitsDeps = { profile: ProfilePort; clock: Clock };

/** A learner opened a course: move it to the front of their history, or count another visit. */
export const visitCourse = ({ profile, clock }: CourseVisitsDeps) =>
  async (learnerId: string, course: Course): Promise<CourseVisit[]> => {
    const visits = recordCourseVisit(await profile.getCourseVisits(learnerId), course, clock.now());
    await profile.saveCourseVisits(learnerId, visits);
    return visits;
  };

export const setFavouriteCourse = ({ profile }: Pick<CourseVisitsDeps, "profile">) =>
  async (learnerId: string, courseId: string, favourite: boolean): Promise<CourseVisit[]> => {
    const visits = favouriteCourseVisit(await profile.getCourseVisits(learnerId), courseId, favourite);
    await profile.saveCourseVisits(learnerId, visits);
    return visits;
  };

export const forgetCourseVisit = ({ profile }: Pick<CourseVisitsDeps, "profile">) =>
  async (learnerId: string, courseId: string): Promise<CourseVisit[]> => {
    const visits = withoutCourse(await profile.getCourseVisits(learnerId), courseId);
    await profile.saveCourseVisits(learnerId, visits);
    return visits;
  };

export type CountCourseVisitDeps = { catalogue: CourseCatalogue; clock: Clock };

/**
 * Someone opened a course: the public catalogue counts it and keeps its card current. Branch and
 * preview deploys of a course site are not courses, so they are never counted.
 */
export const countCourseVisit = ({ catalogue, clock }: CountCourseVisitDeps) =>
  async (course: Course): Promise<void> => {
    if (!isCatalogueCourseId(course.courseId)) return;
    await catalogue.recordVisit(course.courseId, catalogueRecordOf(course, clock.now()));
  };
