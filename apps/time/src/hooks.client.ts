import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";
import { env } from "$env/dynamic/public";
import { usesSharedHooks } from "@tutors/hooks/mode";
import { initClientErrorHandling, createClientErrorHandler } from "@tutors/hooks/client";
import * as legacy from "./legacy-hooks.client";

(globalThis as any).__TUTORS_TIME_SUPABASE_INIT__ = {
  url: PUBLIC_SUPABASE_URL,
  key: PUBLIC_SUPABASE_ANON_KEY
};

import { initSupabase } from "@tutors/tutors-time-lib";

initSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

// PUBLIC_TUTORS_HOOKS_MODE picks the shared @tutors/hooks implementation or this
// app's original inline hooks. See packages/svelte/utils/hooks/README.md.
const shared = usesSharedHooks(env.PUBLIC_TUTORS_HOOKS_MODE);

if (shared) {
  initClientErrorHandling("tutors-time");
} else {
  legacy.init();
}

export const handleError = shared ? createClientErrorHandler() : legacy.handleError;
