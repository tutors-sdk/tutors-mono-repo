import { TutorsTime } from "@tutors/tutors-time-lib";
import { useReaderTimeSource } from "#lib/time-source.ts";
import { readDateRange } from "#lib/dateRange.ts";

export async function load({ params, url }: { params: Record<string, string>; url: URL }) {
  useReaderTimeSource();
  const { startDate, endDate } = readDateRange(url.searchParams);

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
