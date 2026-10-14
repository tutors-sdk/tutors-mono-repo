import type { Course } from "@tutors/domain/course";

/**
 * Writes a built course out: tutors.json, static HTML, an LLM export. The generator in
 * packages/jsr/gen still carries its own emitter; it moves behind this port when authoring is
 * extracted.
 */
export interface CourseEmitter {
  emit(course: Course, destination: string): Promise<void>;
}
