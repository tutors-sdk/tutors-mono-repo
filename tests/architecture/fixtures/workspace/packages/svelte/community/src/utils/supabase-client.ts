// Allowed: the one anon client factory, for Realtime and public reads.
import { createClient } from "@supabase/supabase-js";

export const client = createClient;
