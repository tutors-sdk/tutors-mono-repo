import { decorateCourseTree, type Course, type Lo } from "../../../packages/jsr/model/src/tutors.ts";
import { materialiseCourse, type CompositeType, type LeafType, type LoShape } from "../../support/arbitraries/course-tree.ts";

/**
 * Builders for executable features: a scenario describes a course as the
 * generator would publish it, and the steps load it through the same
 * `decorateCourseTree` the reader calls, never through a hand-made copy.
 */

export function shape(type: CompositeType | LeafType, title: string, children: LoShape[] = [], extra: Partial<LoShape> = {}): LoShape {
  return { type, title, summary: `${title} summary`, contentMd: `# ${title}`, hide: false, hasImage: true, steps: [], children, ...extra };
}

export function labShape(title: string, steps: { title: string; contentMd: string }[]): LoShape {
  return shape("lab", title, [], { steps });
}

/** Publish `children` as generator JSON and decorate it the way the reader does on load. */
export function loadCourse(courseId: string, title: string, children: LoShape[], properties: Record<string, unknown> = {}): Course {
  const raw = materialiseCourse({ title, summary: `${title} summary`, contentMd: `# ${title}`, children });
  Object.assign(raw.properties, properties);
  const course = structuredClone(raw) as unknown as Course;
  decorateCourseTree(course, courseId, `${courseId}.netlify.app`);
  return course;
}

/** Every learning object the reader indexed, the course itself excluded. */
export function indexedLos(course: Course): Lo[] {
  return [...new Set(course.loIndex.values())].filter((lo) => lo !== course);
}
