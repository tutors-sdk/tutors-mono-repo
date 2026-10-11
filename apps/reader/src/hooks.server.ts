/* global APP_VERSION */
import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { building } from "$app/environment";
import { createIdentityHandle } from "@tutors/identity-sveltekit/server";
import { env } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import { initLocaleFromCookie } from "@tutors/i18n";
import log, { createRequestLogger, installProcessLogging, logRequestError, logServiceStart, setAppName } from "@tutors/logger";
import { metricsHandle } from "@tutors/metrics";
import { announceClock } from "@tutors/runtime";
import { authMode } from "$lib/server/auth-mode";

setAppName("tutors-reader");
// From here on every stdout/stderr line of the running server is one JSON object: stray console
// output, crashes and Node warnings included. Not during `vite build`, which imports this module too.
if (!building) installProcessLogging();

const currentAuthMode = () =>
  authMode({ PUBLIC_ANON_MODE: publicEnv.PUBLIC_ANON_MODE, PRIVATE_AUTH_SECRET: env.PRIVATE_AUTH_SECRET });

export const init: ServerInit = async () => {
  const mode = currentAuthMode();
  logServiceStart({ version: APP_VERSION, authMode: mode });
  announceClock(log);
  if (mode === "unconfigured") {
    log.error("Authentication disabled: PRIVATE_AUTH_SECRET is not set. Set it, or set PUBLIC_ANON_MODE=TRUE.");
  }
};

const authHandle = createIdentityHandle({
  enabled: () => currentAuthMode() === "enabled",
  secret: env.PRIVATE_AUTH_SECRET,
  githubId: env.PRIVATE_AUTH_GITHUB_ID,
  githubSecret: env.PRIVATE_AUTH_GITHUB_SECRET
});

// First in the chain so every request gets a correlation id and one completion line,
// including requests that fail inside the hooks below.
const requestLogger = createRequestLogger();

const localeHandle: Handle = async ({ event, resolve }) => {
  event.locals.locale = initLocaleFromCookie(event.request.headers.get("cookie") ?? "");
  return resolve(event);
};

function setSecurityHeaders(headers: Headers): void {
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  try {
    setSecurityHeaders(response.headers);
    return response;
  } catch {
    // A `Response.redirect()` has immutable headers. OAuth can answer a failed sign-in with one,
    // so without a copy "GitHub said no" would become a 500 (Rule 0255).
    const copy = new Response(response.body, response);
    setSecurityHeaders(copy.headers);
    return copy;
  }
};

export const handle = sequence(requestLogger, metricsHandle, localeHandle, securityHeaders, authHandle);

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  logRequestError({ error, event, status, message });
  return {
    message: "An unexpected error occurred"
  };
};
