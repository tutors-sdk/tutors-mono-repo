import type { HandleClientError } from "@sveltejs/kit/hooks";
import log, { addTransport, setAppName } from "@tutors/logger";
import * as env from "$app/env/public";
import { createSupabaseErrorTransport } from "@tutors/store-supabase";
import { configureAdapters } from "@tutors/svelte-state/adapters";
import { composeLive } from "./lib/compose.ts";

configureAdapters(composeLive(env));

setAppName("tutors-live");
addTransport(createSupabaseErrorTransport("tutors-live"));

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
