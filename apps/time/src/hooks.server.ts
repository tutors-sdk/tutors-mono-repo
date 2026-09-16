/* global APP_VERSION */
import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { createRequestLogger, logRequestError, logServiceStart, setAppName } from "@tutors/logger";
import { metricsHandle } from "@tutors/metrics";

setAppName("tutors-time");

export const init: ServerInit = async () => {
  logServiceStart({ version: APP_VERSION });
};

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export const handle = sequence(createRequestLogger(), metricsHandle, securityHeaders);

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  logRequestError({ error, event, status, message });
  return {
    message: "An unexpected error occurred"
  };
};
