import type { HandleClientError } from "@sveltejs/kit";
import log, { addTransport } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/community/utils/error-transport";

export function initClientErrorHandling(appName: string): void {
  addTransport(createSupabaseErrorTransport(appName));

  window.addEventListener("unhandledrejection", (event) => {
    log.error("Unhandled promise rejection", {
      reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack : undefined
    });
  });
}

export function createClientErrorHandler(): HandleClientError {
  return ({ error }) => {
    log.error("Client error:", error instanceof Error ? error : { details: error });
    return {
      message: "An unexpected error occurred"
    };
  };
}
