import type { Handle, HandleServerError } from "@sveltejs/kit";
import log from "@tutors/logger";

export const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export function createServerErrorHandler(): HandleServerError {
  return ({ error }) => {
    log.error("Server error:", error instanceof Error ? error : { details: error });
    return {
      message: "An unexpected error occurred"
    };
  };
}
