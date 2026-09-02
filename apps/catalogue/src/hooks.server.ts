import type { Handle, HandleServerError } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import log from "@tutors/logger";
import { metricsHandle } from "@tutors/metrics";

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export const handle = sequence(metricsHandle, securityHeaders);

export const handleError: HandleServerError = ({ error }) => {
  log.error("Server error:", error instanceof Error ? error : { details: error });
  return {
    message: "An unexpected error occurred"
  };
};
