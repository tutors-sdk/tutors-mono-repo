export interface CourseSpec {
  courseName: string;
  lecturerName: string;
  courseId: string;
  unitCount: number;
  includeSide: boolean;
  topicsPerUnit: number;
  includeNotes: boolean;
  includeLabs: boolean;
  includeCalendar: boolean;
  includeEnrollment: boolean;
  includeGitignore: boolean;
  includeReadme: boolean;
  /** Free text placed under the heading of the generated README. */
  readmeDescription: string;
  /**
   * When set, the course's shape comes from a teaching pattern and the calendar, not from the unit and
   * topic counts above: one topic per teaching week. See patterns.ts.
   */
  pattern?: PatternChoice;
}

export interface PatternChoice {
  /** One of the ids in patterns.ts. */
  id: string;
  /** Teaching weeks, 1-52. */
  weeks: number;
  /** The Monday teaching starts, YYYY-MM-DD. */
  start: string;
  /** A reading week falls after this teaching week; leave out for none. */
  readingWeek?: number;
}

/** Fixed number of steps generated for each lab (in addition to the Setup step). */
export const LAB_STEP_COUNT = 5;

export const defaultSpec: CourseSpec = {
  courseName: "My New Course",
  lecturerName: "",
  courseId: "my-new-course",
  unitCount: 2,
  includeSide: true,
  topicsPerUnit: 3,
  includeNotes: true,
  includeLabs: true,
  includeCalendar: false,
  includeEnrollment: false,
  includeGitignore: true,
  includeReadme: false,
  readmeDescription: ""
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function padNumber(n: number, width: number = 2): string {
  return String(n).padStart(width, "0");
}
