// Original inline server hooks, kept verbatim so PUBLIC_TUTORS_HOOKS_MODE=legacy
// reproduces pre-@tutors/hooks behaviour exactly. Delete this file once the
// shared implementation is the only one (see packages/svelte/utils/hooks/README.md).
import type { Handle, HandleServerError } from "@sveltejs/kit";
import log from "@tutors/logger";

// The time app had no handle hook (and therefore no security headers) before
// @tutors/hooks. A passthrough keeps legacy mode faithful to that.
export const handle: Handle = ({ event, resolve }) => resolve(event);

export const handleError: HandleServerError = ({ error }) => {
  log.error("Server error:", error instanceof Error ? error : { details: error });
  return {
    message: "An unexpected error occurred"
  };
};
