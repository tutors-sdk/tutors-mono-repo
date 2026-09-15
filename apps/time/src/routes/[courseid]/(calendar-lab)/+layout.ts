import type { LayoutLoad } from "./$types";
import { initSupabase, TutorsTime } from "@tutors/tutors-time-lib";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";
import { enrichCourseUserFields } from "$lib/enrichCourseUserFields";

export const load: LayoutLoad = async ({ params }) => {
  initSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
  const courseId = (params.courseid ?? "").trim();
  if (!courseId) {
    return { course: null };
  }
  const course = await TutorsTime.loadCourseTime(courseId);
  await enrichCourseUserFields(course);
  return { course };
};
