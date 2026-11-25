// Allowed: a driven adapter imports its one technology, the ports and the domain.
import { createClient } from "@supabase/supabase-js";
import { ports } from "@tutors/application";
export const store = () => [createClient, ports];
