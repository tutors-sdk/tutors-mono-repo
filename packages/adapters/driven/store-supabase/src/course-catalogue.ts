/**
 * @service AllCourseAccess
 * Service for tracking and managing course access statistics across all users
 */

import type { Course } from "@tutors/domain/course";
import { courseVisitOf, isCatalogueCourseId, type CourseVisit } from "@tutors/domain/presence";
import log from "@tutors/logger";
import { supabase } from "./client.ts";

/**
 * Updates the course access statistics in the database
 * Increments visit count and updates last visit timestamp
 * @param course - The course being accessed
 */
export async function updateCourseList(course: Course, now: Date = new Date()): Promise<void> {
  if (!supabase || !isCatalogueCourseId(course.courseId)) return;
  const { data, error } = await supabase.from("tutors-connect-courses").select("visit_count").eq("course_id", course.courseId).single();

  if (error && error.code !== "PGRST116") {
    log.error("Error fetching row:", error);
    return;
  }

  const newVisits = data ? data.visit_count + 1 : 1;

  // Upsert the row with the updated count and date
  const { error: upsertError } = await supabase.from("tutors-connect-courses").upsert(
    {
      course_id: course.courseId,
      visited_at: now,
      visit_count: newVisits,
      course_record: getCourseRecord(course, now)
    },
    { onConflict: "course_id" }
  );

  if (upsertError) {
    log.error("Error upserting row:", upsertError);
  }
}

/** The catalogue's record of a course: its visit entry, without a visit count, plus whether it is private. */
function getCourseRecord(course: Course, now: Date): CourseVisit {
  const { visits: _visits, ...visit } = courseVisitOf(course, now);
  return { ...visit, private: course.isPrivate };
}
