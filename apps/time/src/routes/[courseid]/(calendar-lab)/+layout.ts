import type { LayoutLoad } from "./$types";
import { initSupabase, TutorsTime } from "@tutors/tutors-time-lib";
import { env } from "$env/dynamic/public";
import { enrichCourseUserFields } from "$lib/enrichCourseUserFields";

export const load: LayoutLoad = async ({ params }) => {
  initSupabase(env.PUBLIC_SUPABASE_URL ?? "", env.PUBLIC_SUPABASE_ANON_KEY ?? "");
  const courseId = (params.courseid ?? "").trim();
  if (!courseId) {
    return { course: null };
  }
  const course = await TutorsTime.loadCourseTime(courseId);
  await enrichCourseUserFields(course);
  return { course };
};
