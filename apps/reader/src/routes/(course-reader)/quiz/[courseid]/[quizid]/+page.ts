import type { PageLoad } from "./$types";
import { courseService } from "@tutors/course/course";
import { currentLo } from "@tutors/runes";

export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  const course = await courseService.readCourse(params.courseid, fetch);
  currentLo.value = course;
  return { course, quizId: params.quizid };
};
