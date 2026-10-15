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
      const { count, error } = await supabase.from("tutors-connect-profiles").select("*", { count: "exact", head: true });

      if (error) {
        throw error;
      }

      return count || 0;
    } catch (error) {
      log.error("Error fetching course count:", error);
      return 0;
    }
  },

  async pruneCatalogue(fetchFunction: typeof fetch) {
    const catalogue = await this.getCatalogue();
    log.debug("Catalogue size", { count: catalogue.length });
    const invalidIds: string[] = [];
    for (const course of catalogue) {
      try {
        const url = `https://${course.course_id}.netlify.app/tutors.json`;
        const response = await fetchFunction(url, { method: "HEAD" });
        if (!response.ok) {
          invalidIds.push(course.course_id);
        }
      } catch {
        invalidIds.push(course.course_id);
      }
    }
    log.debug("Invalid catalogue courses", { count: invalidIds.length, courseIds: invalidIds });

    if (invalidIds.length > 0) {
      await this.deleteCourses(invalidIds);
    }
  },

  async deleteCourses(courseIds: string[]) {
    if (noSupabase("deleteCourses")) return;
    try {
      const { error } = await supabase.from("tutors-connect-courses").delete().in("course_id", courseIds);

      if (error) {
        log.error("Error deleting courses:", error);
        throw error;
      }
      log.debug("Deleted courses", { count: courseIds.length });
    } catch (error) {
      log.error("Error in deleteCourses:", error);
      throw error;
    }
  }
};
