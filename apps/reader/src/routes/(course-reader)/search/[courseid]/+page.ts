import type { PageLoad } from "./$types";
import { courseService } from "@tutors/course/course";
import { currentLo } from "@tutors/runes";
import type { Course } from "@tutors/tutors-model-lib";

export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  const course: Course = await courseService.readCourse(params.courseid, fetch);
  currentLo.value = course;
  return {
    course: course
  };
};
