import type { CatalogueEntry, CatalogueService } from "../types.svelte.ts";
import { supabase } from "../utils/supabase-client.ts";
import log from "@tutors/logger";

export const catalogueService: CatalogueService = {
  async getCatalogue() {
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

  /** The number of students with a profile, counted by the database: no profile leaves it (Rule 0070). */
  async getStudentCount() {
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
