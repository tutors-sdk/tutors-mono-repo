import type { LayoutLoad } from "./$types";
import { TutorsTime } from "@tutors/tutors-time-lib";
import { initTutorsTimeSupabase } from "@tutors/hooks";
import { enrichCourseUserFields } from "$lib/enrichCourseUserFields";

export const load: LayoutLoad = async ({ params }) => {
  // Universal load also runs during SSR, where hooks.client.ts has not run.
  initTutorsTimeSupabase();
  const courseId = (params.courseid ?? "").trim();
  if (!courseId) {
    return { course: null };
  }
  const course = await TutorsTime.loadCourseTime(courseId);
  await enrichCourseUserFields(course);
  return { course };
};
