import type { PageLoad } from "./$types";
import { courseService } from "@tutors/course/course";

export const ssr = false;

export const load: PageLoad = async ({ params, fetch }) => {
  const course = await courseService.readCourse(params.courseid, fetch);
  return { course, quizId: params.quizid };
};
