import { currentCourse, isEducator } from "@tutors/runes";
import { courseService } from "@tutors/course/course";
import { rbacService } from "@tutors/rbac";
import type { Lo } from "@tutors/tutors-model-lib";
import { generateLlms } from "./llms";

export const ssr = false;

export const load = async ({ params, fetch }) => {
  const course = await courseService.readCourse(params.courseid, fetch);
  currentCourse.value = course;

  if (course.hasEnrollment) {
    await rbacService.loadContentLocks(course.courseId);
  }

  const visibility = course.hasEnrollment && !isEducator.value
    ? {
        isVisible: (lo: Lo) => rbacService.isLoVisibleToStudent(lo),
        hideCourseWideLinks: rbacService.hasActiveLocks(),
      }
    : undefined;

  const llmsLinks = generateLlms(course, visibility);
  return {
    course,
    llmsLinks,
  };
};
