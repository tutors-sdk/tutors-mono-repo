import type { Handle, HandleServerError } from "@sveltejs/kit";
import log from "@tutors/logger";

/** Headers applied to every response by {@link securityHeaders}. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

export const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
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
