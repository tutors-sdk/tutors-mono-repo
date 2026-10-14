import type { Course } from "@tutors/domain/course";
import { recordCourseVisit, type CourseVisit } from "@tutors/domain/presence";
import type { Clock } from "../ports/clock.ts";
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
    const visits = await profile.getCourseVisits(learnerId);
    const visit = visits.find((c) => c.id === courseId);
    if (visit) visit.favourite = favourite;
    await profile.saveCourseVisits(learnerId, visits);
    return visits;
  };

export const forgetCourseVisit = ({ profile }: Pick<CourseVisitsDeps, "profile">) =>
  async (learnerId: string, courseId: string): Promise<CourseVisit[]> => {
    const visits = (await profile.getCourseVisits(learnerId)).filter((c) => c.id !== courseId);
    await profile.saveCourseVisits(learnerId, visits);
    return visits;
  };
