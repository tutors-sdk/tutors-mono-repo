import { decorateCourseTree, filterByType, type Course, type Lab, type Lo } from "../../../packages/jsr/model/src/tutors.ts";
import { LiveLab } from "../../../packages/svelte/course/src/course/services/live-lab.ts";
import { materialiseCourse, type LoShape, type RawCourse } from "../../support/arbitraries/course-tree.ts";

/**
 * What the reader does with a loaded course, for executable features: the same
 * product calls its pages make, with nothing re-implemented here.
 */

/**
 * Like `loadCourse`, but lets a scenario edit the published JSON first, for
 * generator output a `LoShape` cannot describe (a lab's PDF, say).
 */
export function loadPublishedCourse(courseId: string, title: string, children: LoShape[], edit: (raw: RawCourse) => void): Course {
  const raw = materialiseCourse({ title, summary: `${title} summary`, contentMd: `# ${title}`, children });
  edit(raw);
  const course = structuredClone(raw) as unknown as Course;
  decorateCourseTree(course, courseId, `${courseId}.netlify.app`);
  return course;
}

/** The learning objects the reader's search page hands to `searchHits`. */
export function searchableLos(course: Course): Lo[] {
  return [
    ...filterByType(course.los, "lab"),
    ...filterByType(course.los, "step"),
    ...filterByType(course.los, "note"),
    ...filterByType(course.los, "panelnote")
  ];
}

/** The only lab with this title, wherever it sits in the course. */
export function labTitled(course: Course, title: string): Lab {
  const labs = filterByType(course.los, "lab").filter((lo) => lo.title === title);
  if (labs.length !== 1) throw new Error(`expected exactly one lab titled "${title}", found ${labs.length}`);
  return labs[0] as Lab;
}

/** Open a lab the way the reader's lab route does. */
export function openLab(course: Course, lab: Lab): LiveLab {
  return new LiveLab(course, lab, lab.route);
}

/** Follow a breadcrumb as a browser would: by its route, through the course index. */
export function followCrumb(course: Course, from: Lo, crumbTitle: string): Lo | undefined {
  const crumb = from.breadCrumbs?.find((lo) => lo.title === crumbTitle);
  if (!crumb) throw new Error(`"${from.title}" has no breadcrumb titled "${crumbTitle}"`);
  return course.loIndex.get(crumb.route);
}
