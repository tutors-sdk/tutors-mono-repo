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
  includeCalendar: true,
  includeEnrollment: false,
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
