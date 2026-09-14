import type { HandleClientError } from "@sveltejs/kit";
import log, { addTransport } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/community/utils/error-transport";
import { supabaseConfig } from "@tutors/supabase";
import { initSupabase } from "@tutors/tutors-time-lib";

export function initClientErrorHandling(appName: string): void {
  addTransport(createSupabaseErrorTransport(appName));

  window.addEventListener("unhandledrejection", (event) => {
    log.error("Unhandled promise rejection", {
      reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack : undefined
    });
  });
}

/**
 * Hands the shared Supabase connection details to the framework-free
 * time-lib, which cannot read SvelteKit env modules itself. Call once from
 * hooks.client.ts in any app that renders TutorsTime analytics.
 */
export function initTutorsTimeSupabase(): void {
  (globalThis as { __TUTORS_TIME_SUPABASE_INIT__?: { url: string; key: string } }).__TUTORS_TIME_SUPABASE_INIT__ = {
    url: supabaseConfig.url,
    key: supabaseConfig.anonKey
  };
  initSupabase(supabaseConfig.url, supabaseConfig.anonKey);
}

export function createClientErrorHandler(): HandleClientError {
  return ({ error }) => {
    log.error("Client error:", error instanceof Error ? error : { details: error });
    return {
      message: "An unexpected error occurred"
    };
  };
}
