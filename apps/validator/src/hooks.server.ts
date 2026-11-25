/* global APP_VERSION */
import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";
import { sequence } from "@sveltejs/kit/hooks";
import { building } from "$app/env";
import { createRequestLogger, installProcessLogging, logRequestError, logServiceStart, setAppName } from "@tutors/logger";
import { metricsHandle } from "@tutors/metrics";

setAppName("tutors-validator");
if (!building) installProcessLogging();
export const init: ServerInit = async () => {
  logServiceStart({ version: APP_VERSION });
};

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: http: ws:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
  return response;
};

export const handle = sequence(createRequestLogger(), metricsHandle, securityHeaders);
export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind !== "unknown") return;
  logRequestError({ error, event, status: 500, message: "Internal Error" });
  return { status: 500, message: "An unexpected error occurred" };
};
