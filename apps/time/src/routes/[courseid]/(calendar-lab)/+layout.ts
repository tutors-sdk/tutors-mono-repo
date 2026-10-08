import type { LayoutLoad } from "./$types";
import { TutorsTime } from "@tutors/tutors-time-lib";
import { enrichCourseUserFields } from "$lib/enrichCourseUserFields";
import { isSignedOut, readerSignInUrl, useReaderTimeSource } from "$lib/time-source";

export const load: LayoutLoad = async ({ params }) => {
  useReaderTimeSource();
  const courseId = (params.courseid ?? "").trim();
  if (!courseId) {
    return { course: null, signInUrl: null };
  }
  try {
    const course = await TutorsTime.loadCourseTime(courseId);
    await enrichCourseUserFields(course);
    return { course, signInUrl: null };
  } catch (error) {
    if (isSignedOut(error)) return { course: null, signInUrl: readerSignInUrl() };
    throw error;
  }
};
