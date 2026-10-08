import { error, type HandleClientError } from "@sveltejs/kit";
import log, { addTransport, setAppName } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/community/utils/error-transport";

import { readerTimeSource, setTutorsTimeSource } from "@tutors/tutors-time-lib";
import { setCourseNotFoundHandler, setCourseUnreachableHandler } from "@tutors/course/course";

setTutorsTimeSource(readerTimeSource(""));

// A course that does not exist is a 404 page, not an unexpected error (a 500). A browser cannot tell
// an unknown course site from being offline, so an unreachable host is a 404 page as well.
setCourseNotFoundHandler((notFound) => error(404, `Course ${notFound.courseId} not found at https://${notFound.courseUrl}/tutors.json`));
setCourseUnreachableHandler(() => error(404, "Course not found"));

setAppName("tutors-reader");
addTransport(createSupabaseErrorTransport("tutors-reader"));

window.addEventListener("unhandledrejection", (event) => {
  log.error("Unhandled promise rejection", {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined
  });
});

export const handleError: HandleClientError = ({ error }) => {
  log.error("Client error:", error instanceof Error ? error : { details: error });
  return {
    message: "An unexpected error occurred"
  };
};
