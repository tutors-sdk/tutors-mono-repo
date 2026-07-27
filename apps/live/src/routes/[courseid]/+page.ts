import { courseService } from "@tutors/course/course";

export const load = async ({ params, fetch }) => {
  const course = await courseService.readCourse(params.courseid, fetch);
  return {
    courseid: params.courseid,
    course: course
  };
};
