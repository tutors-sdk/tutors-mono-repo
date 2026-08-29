export interface CourseSpec {
  courseName: string;
  lecturerName: string;
  courseId: string;
  topicCount: number;
  labsPerTopic: number;
  labStepCount: number;
  includeTalks: boolean;
  includeNotes: boolean;
}

export const defaultSpec: CourseSpec = {
  courseName: "My New Course",
  lecturerName: "",
  courseId: "my-new-course",
  topicCount: 2,
  labsPerTopic: 1,
  labStepCount: 3,
  includeTalks: false,
  includeNotes: false,
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
