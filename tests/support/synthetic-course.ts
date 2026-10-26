import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCourse } from "../../packages/jsr/gen/src/tutors.ts";
import type { TutorsJsonCourse, TutorsJsonLo, TutorsJsonStep } from "../../packages/jsr/types/src/tutors-json.ts";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";

/** The committed synthetic corpus course: every learning-object kind the generator knows. */
export const SYNTHETIC_COURSE = join(REPO_ROOT, "tests/generator/corpus/synthetic-course");

let cached: { root: string; json: TutorsJsonCourse } | undefined;

/**
 * The tutors.json the generator writes for the synthetic corpus course, parsed back from text.
 *
 * Built from a copy under the temp directory, as the CLI builds a lecturer's folder, and through
 * JSON.stringify exactly as generateDynamicCourse writes it, so fields set to undefined are absent.
 * Built once per test file; callers get a fresh deep copy to change.
 */
export function syntheticTutorsJson(): { root: string; json: TutorsJsonCourse } {
  if (!cached) {
    const root = join(mkdtempSync(join(tmpdir(), "tutors-synthetic-")), "synthetic-course").replaceAll("\\", "/");
    cpSync(SYNTHETIC_COURSE, root, { recursive: true });
    const [course] = parseCourse(root, true);
    cached = { root, json: JSON.parse(JSON.stringify(course)) as TutorsJsonCourse };
  }
  return { root: cached.root, json: structuredClone(cached.json) };
}

/** Every learning object and lab step below `lo`, depth first, `lo` itself excluded. */
export function descendants(lo: { los?: (TutorsJsonLo | TutorsJsonStep)[] }): (TutorsJsonLo | TutorsJsonStep)[] {
  return (lo.los ?? []).flatMap((child) => [child, ...descendants(child as TutorsJsonLo)]);
}
