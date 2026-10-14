import { supabase } from "./client.ts";

/** One row of the catalogue: a course and how often it has been visited. */
export interface CatalogueEntry {
  course_id: string;
  visited_at: Date;
  visit_count: number;
  course_record: any;
}

/** Reads and prunes the catalogue of visited courses. */
export interface CatalogueService {
  getCatalogue(): Promise<CatalogueEntry[]>;
  getCatalogueCount(): Promise<number>;
  getStudentCount(): Promise<number>;
  pruneCatalogue(fetchFunction: typeof fetch): Promise<void>;
  deleteCourses(courseIds: string[]): Promise<void>;
}
import log from "@tutors/logger";

export const catalogueService: CatalogueService = {
  async getCatalogue() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase!.from("tutors-connect-courses").select("*").order("visited_at", { ascending: false });

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
    if (!supabase) return 0;
    try {
      const { count, error } = await supabase!.from("tutors-connect-courses").select("*", { count: "exact", head: true });

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
    if (!supabase) return 0;
    try {
      const { count, error } = await supabase!.from("tutors-connect-profiles").select("*", { count: "exact", head: true });

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
    if (!supabase) return;
    try {
      const { error } = await supabase!.from("tutors-connect-courses").delete().in("course_id", courseIds);

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
