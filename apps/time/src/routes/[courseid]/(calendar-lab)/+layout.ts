import type { LayoutLoad } from "./$types";
import { initSupabase, TutorsTime } from "@tutors/tutors-time-lib";
import * as env from "$app/env/public";
import { enrichCourseUserFields } from "#lib/enrichCourseUserFields.ts";
import { readDateRange } from "#lib/dateRange.ts";

export const load: LayoutLoad = async ({ params, url }) => {
  // The reporting period lives in the address, so reload, history and links keep it.
  const { startDate, endDate } = readDateRange(url.searchParams);
  initSupabase(env.PUBLIC_SUPABASE_URL ?? "", env.PUBLIC_SUPABASE_ANON_KEY ?? "");
  const courseId = (params.courseid ?? "").trim();
  if (!courseId) {
    return { course: null };
  }
  const course = await TutorsTime.loadCourseTime(courseId, startDate, endDate);
  await enrichCourseUserFields(course);
  return { course };
};
