import type { Course, IconType } from "@tutors/tutors-model-lib";
import { dataApi } from "@tutors/data-api";
import type { CourseVisit } from "../types.ts";

export async function updateCourseList(course: Course): Promise<void> {
  if (!isValidCourseName(course.courseId)) return;
  await dataApi.reportCourseVisit({ courseId: course.courseId, courseRecord: getCourseRecord(course) as unknown as Record<string, unknown> });
}

/**
 * Creates a CourseVisit record from a Course object
 * @param course - The course to create a visit record for
 * @returns CourseVisit object with course metadata
 */
function getCourseRecord(course: Course) {
  const courseVisit: CourseVisit = {
    id: course.courseId,
    title: course.title,
    lastVisit: new Date().toISOString(),
    credits: course.properties.credits,
    private: course.isPrivate
  };
  if (course.properties.icon) {
    courseVisit.icon = course.properties.icon as unknown as IconType;
  } else {
    courseVisit.img = course.img;
  }
  return courseVisit;
}

/**
 * Validates if a course name is appropriate for tracking
 * @param course - Course identifier to validate
 * @returns boolean indicating if course name is valid
 */
function isValidCourseName(course: string) {
  const invalidPatterns = /^(main--|master--|deploy-preview--)|-{2}/;
  return !invalidPatterns.test(course);
}
