// Violates ui-imports-no-driven-adapter: a UI package reaching a driven adapter instead of a port.
import { store } from "@tutors/store-supabase";
export const reachesDriven = store;
