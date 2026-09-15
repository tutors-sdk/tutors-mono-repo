// Original inline client hooks, kept verbatim so PUBLIC_TUTORS_HOOKS_MODE=legacy
// reproduces pre-@tutors/hooks behaviour exactly. The module-level side effects
// are wrapped in init() so importing this file registers nothing on its own.
// Delete this file once the shared implementation is the only one
// (see packages/svelte/utils/hooks/README.md).
import type { HandleClientError } from "@sveltejs/kit";
import log, { addTransport } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/community/utils/error-transport";

export function init(): void {
  addTransport(createSupabaseErrorTransport("tutors-live"));

  window.addEventListener("unhandledrejection", (event) => {
    log.error("Unhandled promise rejection", {
      reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack : undefined
    });
  });
}

export const handleError: HandleClientError = ({ error }) => {
  log.error("Client error:", error instanceof Error ? error : { details: error });
  return {
    message: "An unexpected error occurred"
  };
};
