// Violates application-imports-domain-only: a use case reaches a technology directly.
import { createClient } from "@supabase/supabase-js";
export const leaks = createClient;
