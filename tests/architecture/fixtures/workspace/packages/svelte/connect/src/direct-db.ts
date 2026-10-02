// Negative fixture: browser code talking to the database client directly (no-database-client-in-browser-code).
import { createClient } from "@supabase/supabase-js";

export const client = createClient;
