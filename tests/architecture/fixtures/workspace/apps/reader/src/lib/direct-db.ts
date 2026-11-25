// Negative fixture: an app talking to the database client directly (no-database-client-in-apps).
import { createClient } from "@supabase/supabase-js";

export const client = createClient;
