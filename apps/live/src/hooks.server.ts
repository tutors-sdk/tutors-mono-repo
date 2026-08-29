import type { Handle, HandleServerError } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import log, { setServiceName } from "@tutors/logger";

setServiceName("tutors-live");

log.info("Service starting", { service: "tutors-live" });

const requestLogger: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith("/healthz")) {
    return resolve(event);
  }

  const requestId = event.request.headers.get("x-request-id") || crypto.randomUUID();
  const start = performance.now();

  const response = await resolve(event);

  const duration = performance.now() - start;

  log.info("request completed", {
    requestId,
    method: event.request.method,
    path: event.url.pathname,
    status: response.status,
    duration_ms: Math.round(duration)
  });

  response.headers.set("x-request-id", requestId);
  return response;
};

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export const handle = sequence(requestLogger, securityHeaders);

export const handleError: HandleServerError = ({ error }) => {
  log.error("Unhandled server error", error instanceof Error ? error : new Error(String(error)));
  return {
    message: "An unexpected error occurred"
  };
};
