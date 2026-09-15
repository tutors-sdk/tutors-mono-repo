// Original inline server hooks, kept verbatim so PUBLIC_TUTORS_HOOKS_MODE=legacy
// reproduces pre-@tutors/hooks behaviour exactly. Delete this file once the
// shared implementation is the only one (see packages/svelte/utils/hooks/README.md).
import type { Handle, HandleServerError } from "@sveltejs/kit";
import log from "@tutors/logger";

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export const handle = securityHeaders;

export const handleError: HandleServerError = ({ error }) => {
  log.error("Server error:", error instanceof Error ? error : { details: error });
  return {
    message: "An unexpected error occurred"
  };
};
