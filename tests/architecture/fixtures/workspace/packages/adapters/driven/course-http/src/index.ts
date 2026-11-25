// Violates vendor-only-in-its-adapter: Supabase outside the store and realtime adapters.
import { createClient } from "@supabase/supabase-js";
export const source = createClient;
