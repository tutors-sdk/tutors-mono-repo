import { error } from "@sveltejs/kit";
import type { HandleClientError } from "@sveltejs/kit/hooks";
import * as env from "$app/env/public";
import log, { addTransport, setAppName } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/store-supabase";
import { configureAdapters } from "@tutors/svelte-state/adapters";
import { createIdentityClient } from "@tutors/identity-better-auth/client";
import { setCourseNotFoundHandler, setCourseUnreachableHandler } from "@tutors/svelte-state/course";
import { composeReader } from "#lib/compose.ts";

(globalThis as any).__TUTORS_TIME_SUPABASE_INIT__ = {
  url: env.PUBLIC_SUPABASE_URL,
  key: env.PUBLIC_SUPABASE_ANON_KEY
};

// The composition root: every port gets its adapter here, before anything reads one.
configureAdapters(composeReader(env, { identityClient: createIdentityClient() }));

// A course that does not exist is a 404 page, not an unexpected error (a 500). A browser cannot tell
// an unknown course site from being offline, so an unreachable host is a 404 page as well.
setCourseNotFoundHandler((notFound) => error(404, `Course ${notFound.courseId} not found at https://${notFound.courseUrl}/tutors.json`));
setCourseUnreachableHandler(() => error(404, "Course not found"));

setAppName("tutors-reader");
addTransport(createSupabaseErrorTransport("tutors-reader"));

window.addEventListener("unhandledrejection", (event) => {
  log.error("Unhandled promise rejection", {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined
  });
});

export const handleError: HandleClientError = ({ kind, error }) => {
  if (kind !== "unknown") return;
  log.error("Client error:", error instanceof Error ? error : { details: error });
  return {
    status: 500,
    message: "An unexpected error occurred"
  };
};
