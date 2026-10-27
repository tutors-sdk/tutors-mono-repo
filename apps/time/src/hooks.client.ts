/**
 * Browser hooks for the time app, loaded by SvelteKit once per page load.
 * Uses the authenticated reader API for @tutors/tutors-time-lib. Warn and error log
 * lines are batched to the Supabase app_errors table (skipped when Supabase is not configured), unhandled
 * promise rejections are logged, and unexpected errors show a generic 500 message.
 */
import type { HandleClientError } from "@sveltejs/kit/hooks";
import log, { addTransport, setAppName } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/community/utils/error-transport";

import { useReaderTimeSource } from "#lib/time-source.ts";

useReaderTimeSource();

setAppName("tutors-time");
addTransport(createSupabaseErrorTransport("tutors-time"));

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
