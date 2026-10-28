import * as fs from "node:fs";
import * as path from "node:path";
import type { CourseSpec } from "./types.ts";
import { generateCourseFiles } from "./generate.ts";

/** Thrown when the course's destination already exists, so nothing was written. */
export class CourseDirectoryExistsError extends Error {
  constructor(readonly courseDir: string) {
    super(`${courseDir} already exists; choose another course name or move the existing folder.`);
    this.name = "CourseDirectoryExistsError";
  }
}

export function writeCourseToFilesystem(spec: CourseSpec, outputDir: string): void {
  const courseDir = path.join(outputDir, spec.courseId);
  const files = generateCourseFiles(spec);
  fs.mkdirSync(outputDir, { recursive: true });
  // Claim the course folder exclusively: an existing folder, file or symlink
  // (even a dangling one) fails with EEXIST, and so does a concurrent run that
  // claimed it first, so an author's work is never overwritten.
  try {
    fs.mkdirSync(courseDir);
  } catch (error) {
    if ((error as { code?: string }).code === "EEXIST") throw new CourseDirectoryExistsError(courseDir);
    throw error;
  }
  for (const file of files) {
    const fullPath = path.join(courseDir, file.relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, { encoding: "utf-8", flag: "wx" });
  }
}

export { generateCourseFiles, type GeneratedFile } from "./generate.ts";
export { type CourseSpec } from "./types.ts";
export { slugify, defaultSpec } from "./types.ts";
export { nextStepsMessage } from "./templates.ts";
