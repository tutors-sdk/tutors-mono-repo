/**
 * @service AllCourseAccess
 * Service for tracking course access statistics across all users
 */

import type { Course, IconType } from "@tutors/tutors-model-lib";
import { readerApi } from "@tutors/community/utils/reader-api";
import type { CourseVisit } from "../types.ts";

/**
 * Counts a visit to the course in the public catalogue, through the reader's server, which checks the
 * course is published and takes its title, credits and privacy from the published course.
 * @param course - The course being accessed
 */
export async function updateCourseList(course: Course): Promise<void> {
  if (!isValidCourseName(course.courseId)) return;
  await readerApi("POST", "/api/courses/visit", { courseId: course.courseId, courseRecord: getCourseRecord(course) });
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
