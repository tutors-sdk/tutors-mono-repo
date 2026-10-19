import { copyAssets, generateStaticCourse, parseCourse } from "@tutors/tutors-gen-lib";
import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";

/** The generator calls tutors-lite makes, injectable so a test can stand in for any one of them. */
export interface LiteGenerator {
  parseCourse: typeof parseCourse;
  generateStaticCourse: typeof generateStaticCourse;
  copyAssets: typeof copyAssets;
}

const defaultGenerator: LiteGenerator = { parseCourse, generateStaticCourse, copyAssets };

/**
 * Builds the course in `srcFolder` into `srcFolder/html` and returns the process exit code:
 * 0 for a completed build, 1 when course.md is missing or generation fails. On failure assets
 * are not copied, so a partial html/ folder is never presented as a finished build.
 */
export async function runTutorsLite(srcFolder: string, srcVentoFolder: string = "", generator: LiteGenerator = defaultGenerator): Promise<number> {
  if (!fs.existsSync(path.join(srcFolder, "course.md"))) {
    process.stderr.write("Cannot locate course.md. Please change to course folder and try again.\n");
    return 1;
  }
  const destFolder = `${srcFolder}/html`;
  const [course, lr] = generator.parseCourse(srcFolder);
  // generateStaticCourse has already written its own error line to stderr.
  if (!(await generator.generateStaticCourse(course, destFolder, srcVentoFolder))) {
    process.stderr.write("tutors-lite: static generation failed; html/ is incomplete and assets were not copied.\n");
    return 1;
  }
  generator.copyAssets(lr, destFolder);
  return 0;
}
