import type { LayoutLoad } from "./$types";
import { TutorsTime } from "@tutors/tutors-time-lib";
import { enrichCourseUserFields } from "#lib/enrichCourseUserFields.ts";
import { isSignedOut, readerSignInUrl, useReaderTimeSource } from "#lib/time-source.ts";
import { readDateRange } from "#lib/dateRange.ts";

export const load: LayoutLoad = async ({ params, url }) => {
  useReaderTimeSource();
  // The reporting period lives in the address, so reload, history and links keep it.
  const { startDate, endDate } = readDateRange(url.searchParams);
  const courseId = (params.courseid ?? "").trim();
  if (!courseId) {
    return { course: null, signInUrl: null };
  }
  try {
    const course = await TutorsTime.loadCourseTime(courseId, startDate, endDate);
    await enrichCourseUserFields(course, startDate, endDate);
    return { course, signInUrl: null };
  } catch (error) {
    if (isSignedOut(error)) return { course: null, signInUrl: readerSignInUrl() };
    throw error;
  }
};
