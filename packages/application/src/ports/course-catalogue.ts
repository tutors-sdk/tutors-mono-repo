import type { CourseVisit } from "@tutors/domain/presence";

/** Counts visits to published courses, for the public catalogue. */
export interface CourseCatalogue {
  /** A course was opened: count the visit and keep its catalogue record current. */
  recordVisit(courseId: string, record: CourseVisit): Promise<void>;
}
