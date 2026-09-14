import { TutorsTime } from "@tutors/tutors-time-lib";
import { initTutorsTimeSupabase } from "@tutors/hooks";

export async function load({ params }: { params: Record<string, string> }) {
  // Universal load also runs during SSR, where hooks.client.ts has not run.
  initTutorsTimeSupabase();

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
