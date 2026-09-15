import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";
import { TutorsTime, initSupabase } from "@tutors/tutors-time-lib";

// Run before any load functions. Hooks modules load at app startup.

export async function load({ params }: { params: Record<string, string> }) {
  initSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

  const courseId = (params.courseid ?? "").trim();
  const studentId = (params.studentid ?? "").trim();
  if (!courseId || !studentId) {
    return { course: null };
  }
  const courseTime = await TutorsTime.loadCourseTime(courseId);

    const studentCalendar = await TutorsTime.loadStudentTime(
      courseId,
      studentId,
      null,
      null
    );

  return { course: courseTime, studentCalendar: studentCalendar };
}
