/* global Deno */
/**
 * Builds the E2E fixture course with the repo's own scaffolder and generator,
 * so the journeys never depend on GitHub or Netlify.
 *
 *   deno run -A --no-lock tests/e2e-stack/fixture-course/build.ts [outDir]
 *
 * Output (default tests/e2e-stack/work/course, git-ignored): tutors.json plus
 * assets, ready for serve.mjs. The spec below is the contract the journeys rely
 * on (`fixture` in tests/e2e-stack/journeys/stack.ts); change both together.
 */
import { fileURLToPath } from "node:url";
import { writeCourseToFilesystem } from "../../../packages/jsr/create/src/scaffolder.ts";
import { copyAssets, generateDynamicCourse, parseCourse } from "../../../packages/jsr/gen/src/tutors.ts";

export const FIXTURE_SPEC = {
  courseName: "Runway Fixture Course",
  lecturerName: "Tutors CI",
  courseId: "runway-fixture",
  unitCount: 1,
  includeSide: false,
  topicsPerUnit: 2,
  includeNotes: true,
  includeLabs: true,
  includeCalendar: false,
  includeEnrollment: false,
  includeGitignore: false,
  includeReadme: false,
  readmeDescription: "",
};

const outDir = Deno.args[0] ?? fileURLToPath(new URL("../work/course", import.meta.url));
// Scaffold into a temp dir, outside the repo. (Generators before the dotted-path
// fix also corrupted every lab step id under a dotted directory such as .claude.)
const srcDir = await Deno.makeTempDir({ prefix: "tutors_fixture_" });

await Deno.remove(outDir, { recursive: true }).catch(() => {});
writeCourseToFilesystem(FIXTURE_SPEC, srcDir);
// The scaffolder nests the course under its id, as `deno run jsr:@tutors/tutors-create` does.
const courseDir = `${srcDir}/${FIXTURE_SPEC.courseId}`;

// The generator resolves course files relative to the working directory, as the tutors CLI does.
Deno.chdir(courseDir);
const [course, lr] = parseCourse(courseDir);
generateDynamicCourse(course, outDir);
copyAssets(lr, outDir);
console.log(`fixture course written to ${outDir}`);
