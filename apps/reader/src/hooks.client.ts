import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";
import { initClientErrorHandling, createClientErrorHandler } from "@tutors/hooks";

(globalThis as any).__TUTORS_TIME_SUPABASE_INIT__ = {
  url: PUBLIC_SUPABASE_URL,
  key: PUBLIC_SUPABASE_ANON_KEY
};

import { initSupabase } from "@tutors/tutors-time-lib";

initSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

initClientErrorHandling("tutors-reader");

export const handleError = createClientErrorHandler();
