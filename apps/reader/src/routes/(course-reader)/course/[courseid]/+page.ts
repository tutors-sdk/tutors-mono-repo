import { currentCourse } from "@tutors/svelte-state";
import { courseService } from "@tutors/svelte-state/course";

export const ssr = false;

export const load = async ({ params, fetch }) => {
  const course = await courseService.readCourse(params.courseid, fetch);
  currentCourse.value = course;

  return {
    course,
    lo: course
  };
};
