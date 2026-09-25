import type { HandleClientError } from "@sveltejs/kit";
import log, { addTransport, setAppName } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/community/utils/error-transport";

import { useReaderTimeSource } from "$lib/time-source";

// Course rows come from the reader's API with the viewer's reader session, never from the database.
useReaderTimeSource();

setAppName("tutors-time");
addTransport(createSupabaseErrorTransport("tutors-time"));

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
