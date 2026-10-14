import { decorateCourseTree, type Course, type DecorateOptions, type Lo } from "@tutors/domain/course";
import type { Clock } from "../ports/clock.ts";
import type { ContentRenderer } from "../ports/content-renderer.ts";
import type { CourseLocation, CourseSource } from "../ports/course-source.ts";

export type LoadCourseDeps = {
  source: CourseSource;
  renderer: ContentRenderer;
  clock: Clock;
  /**
   * How much to render while the tree is built. The reader renders labs, notes, notebooks and
   * quizzes on demand, so it passes a renderer that converts only their summaries; the default
   * renders every learning object.
   */
  render?: (course: Course, lo: Lo) => void;
  /** Extra decoration (the reader registers companion icons with its theme) once the tree is built. */
  decorated?: (course: Course) => void;
  omitFromIndex?: DecorateOptions["omitFromIndex"];
};

/**
 * Load a published course and build its tree. Maths support is loaded before parsing when the
 * text looks like it needs it, so every later conversion of the course is synchronous.
 */
export const loadCourse = ({ source, renderer, clock, render, decorated, omitFromIndex }: LoadCourseDeps) =>
  async (location: CourseLocation): Promise<Course> => {
    const text = await source.load(location);
    if (renderer.mayContainMath(text)) await renderer.loadMath();
    const course = JSON.parse(text) as Course;
    decorateCourseTree(course, location.courseId, location.courseUrl, {
      render: render ?? ((c, lo) => renderer.renderLo(c, lo, location.protocol)),
      today: clock.nowMs(),
      protocol: location.protocol,
      omitFromIndex
    });
    decorated?.(course);
    return course;
  };
