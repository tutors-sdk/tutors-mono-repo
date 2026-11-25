import type { CourseId } from "@tutors/domain/course/address";
import type { CourseFacts } from "@tutors/domain/access";

/**
 * What asking a course's host about the course came to: its facts; no such course (or an id the
 * server will not ask a host about); or no answer just now.
 */
export type CourseFactsLookup = { readonly kind: "found"; readonly facts: CourseFacts } | { readonly kind: "missing" } | { readonly kind: "unavailable" };

/** Where the server reads what a course publishes about itself: its title, educators and privacy. */
export interface CourseFactsSource {
  read(courseId: CourseId): Promise<CourseFactsLookup>;
}
