import type { HandleClientError } from "@sveltejs/kit";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";
import log, { addTransport } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/community/utils/error-transport";

(globalThis as any).__TUTORS_TIME_SUPABASE_INIT__ = {
  url: PUBLIC_SUPABASE_URL,
  key: PUBLIC_SUPABASE_ANON_KEY
};

import { initSupabase } from "@tutors/tutors-time-lib";

initSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

addTransport(createSupabaseErrorTransport("tutors-time"));

window.addEventListener("unhandledrejection", (event) => {
  log.error("Unhandled promise rejection", {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined
  });
});

export const handleError: HandleClientError = ({ error }) => {
  log.error("Client error:", error instanceof Error ? error : { details: error });
  return {
    message: "An unexpected error occurred"
  };
};
