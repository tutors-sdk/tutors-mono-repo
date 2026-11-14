import { buildCourse } from "./services/course-builder.ts";
import { decorateCourseTree, loadMath } from "@tutors/tutors-model-lib";
import type { Course, Lo } from "@tutors/tutors-model-lib";

import { writeFile } from "./utils/file-utils.ts";
import { generateNetlifyToml } from "./utils/netlify.ts";
import { generateLlms } from "./utils/llms.ts";
import { emitStaticCourse } from "./services/course-emitter.ts";
import { writeVentoTemplates } from "./templates/template-writer.ts";
import { initTemplateEngine } from "./templates/template-engine.ts";
import { buildTree, buildUnprunedTree, copyAssetFiles, pruneTree } from "./services/resource-builder.ts";
import type { CourseTree } from "./services/resource-builder.ts";
import type { LearningResource } from "./types/types.ts";

// The model lib loads KaTeX on demand so the reader's bundle can skip it; the
// generator renders every course up front, so it always has math on.
await loadMath();

export function parseCourse(folder: string, silent: boolean = false): [Course, LearningResource] {
  const lr = buildTree(folder);
  const course = buildCourse(lr, silent);
  return [course, lr];
}

/**
 * The course folder as a tree before pruning: every folder is present, typed as the generator types
 * it. A folder takes its kind from the nearest segment of its path that names one, so a folder inside
 * a topic (topic-1/drafts) is typed as that topic, and one with no kind anywhere on its path is typed
 * "unknown". pruneCourseTree removes the "unknown" ones, which is exactly what parseCourse does before
 * building.
 */
export function readCourseTree(folder: string): CourseTree {
  return buildUnprunedTree(folder);
}

export function pruneCourseTree(tree: CourseTree): void {
  pruneTree(tree);
}

export type { CourseTree } from "./services/resource-builder.ts";
export type { LearningResource } from "./types/types.ts";

export function copyAssets(lr: LearningResource, folder: string) {
  copyAssetFiles(lr, folder);
}

export function decorateCourse(course: Course) {
  decorateCourseTree(course);
}

export function generateDynamicCourse(lo: Lo, folder: string) : boolean {
  writeFile(folder, "tutors.json", JSON.stringify(lo));
  generateNetlifyToml(folder);
  generateLlms(lo as Course, folder);
  return true;
}

export async function generateStaticCourse(course: Course, destFolder: string, srcVentoFolder: string = "") : Promise<boolean>  {
  try {
    writeVentoTemplates(destFolder, srcVentoFolder);
    decorateCourseTree(course);
    initTemplateEngine(destFolder);
    await emitStaticCourse(destFolder, course);
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error generating static course: ${message}\n`);
    return false;
  }
}