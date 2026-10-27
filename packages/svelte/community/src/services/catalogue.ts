import type { CatalogueEntry, CatalogueService } from "../types.svelte.ts";
import { supabase } from "../utils/supabase-client.ts";
import log from "@tutors/logger";

/**
 * The client module leaves `supabase` undefined when Supabase is not configured (or in anon mode),
 * promising that such an environment degrades to "no Supabase" instead of throwing.
 * @returns true when there is no client; the caller returns its empty value without logging an error
 */
function noSupabase(operation: string): boolean {
  if (typeof supabase !== "undefined") return false;
  log.debug("Supabase is not configured; skipping", { operation });
  return true;
}

export const catalogueService: CatalogueService = {
  async getCatalogue() {
    if (noSupabase("getCatalogue")) return [];
    try {
      const { data, error } = await supabase.from("tutors-connect-courses").select("*").order("visited_at", { ascending: false });

      if (error) {
        throw error;
      }

      const catalogue = data as Array<CatalogueEntry>;
      return catalogue;
    } catch (error) {
      log.error("Error fetching courses:", error);
      return [];
    }
  },

  async getCatalogueCount() {
    if (noSupabase("getCatalogueCount")) return 0;
    try {
      const { count, error } = await supabase.from("tutors-connect-courses").select("*", { count: "exact", head: true });

      if (error) {
        throw error;
      }

      return count || 0;
    } catch (error) {
      log.error("Error fetching course count:", error);
      return 0;
    }
  },

  async getStudentCount() {
    if (noSupabase("getStudentCount")) return 0;
    try {
      const { data, error } = await supabase.rpc("get_student_count");

      if (error) {
        throw error;
      }

      return Number(data) || 0;
    } catch (error) {
      log.error("Error fetching student count:", error);
      return 0;
    }
  }
};
