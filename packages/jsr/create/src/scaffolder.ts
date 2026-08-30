import * as fs from "node:fs";
import * as path from "node:path";
import type { CourseSpec } from "./types.ts";
import { generateCourseFiles } from "./generate.ts";

export function writeCourseToFilesystem(spec: CourseSpec, outputDir: string): void {
  const courseDir = path.join(outputDir, spec.courseId);
  const files = generateCourseFiles(spec);
  for (const file of files) {
    const fullPath = path.join(courseDir, file.relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, "utf-8");
  }
}

export { generateCourseFiles, type GeneratedFile } from "./generate.ts";
export { type CourseSpec } from "./types.ts";
export { slugify, defaultSpec } from "./types.ts";
export { nextStepsMessage } from "./templates.ts";
