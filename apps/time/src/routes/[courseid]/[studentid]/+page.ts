import * as env from "$app/env/public";
import { TutorsTime, initSupabase } from "@tutors/tutors-time-lib";
import { readDateRange } from "#lib/dateRange.ts";

// Run before any load functions. Hooks modules load at app startup.

export async function load({ params, url }: { params: Record<string, string>; url: URL }) {
  const { startDate, endDate } = readDateRange(url.searchParams);
  initSupabase(env.PUBLIC_SUPABASE_URL ?? "", env.PUBLIC_SUPABASE_ANON_KEY ?? "");

  const courseId = (params.courseid ?? "").trim();
  const studentId = (params.studentid ?? "").trim();
  if (!courseId || !studentId) {
    return { course: null };
  }
  const courseTime = await TutorsTime.loadCourseTime(courseId, startDate, endDate);

    const studentCalendar = await TutorsTime.loadStudentTime(
      courseId,
      studentId,
      startDate,
      endDate
    );

  return { course: courseTime, studentCalendar: studentCalendar };
}
