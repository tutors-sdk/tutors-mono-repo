/**
 * Browser hooks for the reader app, loaded by SvelteKit once per page load.
 * Uses the authenticated reader API for @tutors/tutors-time-lib, makes a missing or
 * unreachable course a 404 page and a course host that does not answer in time a 504. Warn and error log lines are batched to the Supabase app_errors table
 * (skipped when Supabase is not configured), unhandled promise rejections are logged, and unexpected
 * errors show a generic 500 message.
 */
import { error } from "@sveltejs/kit";
import type { HandleClientError } from "@sveltejs/kit/hooks";
import log, { addTransport, setAppName } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/community/utils/error-transport";

import { readerTimeSource, setTutorsTimeSource } from "@tutors/tutors-time-lib";
import { setCourseNotFoundHandler, setCourseTimedOutHandler, setCourseUnreachableHandler } from "@tutors/course/course";

setTutorsTimeSource(readerTimeSource(""));

// A course that does not exist is a 404 page, not an unexpected error (a 500). A browser cannot tell
// an unknown course site from being offline, so an unreachable host is a 404 page as well.
setCourseNotFoundHandler((notFound) => error(404, `Course ${notFound.courseId} not found at https://${notFound.courseUrl}/tutors.json`));
setCourseUnreachableHandler(() => error(404, "Course not found"));
setCourseTimedOutHandler(() => error(504, "The course host did not answer in time"));

setAppName("tutors-reader");
addTransport(createSupabaseErrorTransport("tutors-reader"));

window.addEventListener("unhandledrejection", (event) => {
  log.error("Unhandled promise rejection", {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined
  });
});

export const handleError: HandleClientError = ({ kind, error }) => {
  if (kind !== "unknown") return;
  log.error("Client error:", error instanceof Error ? error : { details: error });
  return {
    status: 500,
    message: "An unexpected error occurred"
  };
};
