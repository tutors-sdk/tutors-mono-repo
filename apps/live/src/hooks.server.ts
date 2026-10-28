/* global APP_VERSION */
/**
 * Server hooks for the live app, loaded by SvelteKit in each server process.
 * Every request runs through the request logger (x-request-id and one JSON completion line), the
 * Prometheus metrics hook and the security headers below. No authentication runs in this app's hooks.
 * Unexpected errors are logged with their request and answered with a generic 500 message.
 */
import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit/hooks";
import { sequence } from "@sveltejs/kit/hooks";
import { building } from "$app/env";
import log, { createRequestLogger, installProcessLogging, logRequestError, logServiceStart, setAppName } from "@tutors/logger";
import { metricsHandle } from "@tutors/metrics";
import { announceClock } from "@tutors/runtime";

setAppName("tutors-live");
// From here on every stdout/stderr line of the running server is one JSON object: stray console
// output, crashes and Node warnings included. Not during `vite build`, which imports this module too.
if (!building) installProcessLogging();

export const init: ServerInit = async () => {
  logServiceStart({ version: APP_VERSION });
  announceClock(log);
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

export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind !== "unknown") return;
  logRequestError({ error, event, status: 500, message: "Internal Error" });
  return {
    status: 500,
    message: "An unexpected error occurred"
  };
};
