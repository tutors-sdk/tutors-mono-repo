// Violates facades-import-rings-only: a facade reaching an adapter.
import { store } from "@tutors/store-supabase";
export const reachesAdapter = store;
