import { currentCourse } from "@tutors/runes";
import { courseService } from "@tutors/course/course";
import { generateLlms } from "./llms";

export const ssr = false;

export const load = async ({ params, fetch }) => {
  const course = await courseService.readCourse(params.courseid, fetch);
  currentCourse.value = course;
  const llmsLinks = generateLlms(course);
  return {
    course,
    llmsLinks
  };
};
