// Violation: identity contracts importing a database.
import { createClient } from "@supabase/supabase-js";
export const database = createClient;
