/**
 * Property test for the generator's lab steps (runway tier B): a lab step's id
 * comes from its file name alone, wherever the course folder lives.
 *
 * Replay a failure: FUZZ_SEED=<seed> FUZZ_PATH=<path> pnpm test:fuzz
 */
import fc from "fast-check";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Composite, Lo } from "../../packages/jsr/model/src/tutors.ts";
import { parseCourse } from "../../packages/jsr/gen/src/tutors.ts";
import { fuzzParameters } from "../support/arbitraries/course-tree.ts";

/** Directory names as they occur above a course: .claude, my.courses, v1.2, worktrees. */
const directory = fc.stringMatching(/^\.?[a-z0-9][a-z0-9._-]{0,8}[a-z0-9]$/).filter((name) => !name.includes(".."));
const parents = fc.array(directory, { minLength: 1, maxLength: 3 });
const stepNames = fc.uniqueArray(fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9-]{0,9}$/), { minLength: 1, maxLength: 4, selector: (name) => name.toLowerCase() });

function lab(lo: Lo): Lo & Composite {
  const found = [lo, ...((lo as Composite).los ?? []).flatMap((child) => [child, ...((child as Composite).los ?? [])])].find((l) => l.type === "lab");
  if (!found) throw new Error("no lab generated");
  return found as Lo & Composite;
}

describe("generator lab steps (runway tier B)", () => {
  it("step ids come from the step file name, not the course's parent directories", () => {
    const scratch = mkdtempSync(join(tmpdir(), "tutors-steps-"));
    try {
      let run = 0;
      fc.assert(
        fc.property(parents, stepNames, (dirs, names) => {
          const root = join(scratch, String(run++), ...dirs, "course").replaceAll("\\", "/");
          mkdirSync(`${root}/topic-01/book-a`, { recursive: true });
          writeFileSync(`${root}/course.md`, "# Course\nA course\n");
          writeFileSync(`${root}/topic-01/topic.md`, "# Topic\nA topic\n");
          names.forEach((name, i) => writeFileSync(`${root}/topic-01/book-a/${String(i).padStart(2, "0")}.${name}.md`, `# ${name}\nstep\n`));

          const [course] = parseCourse(root, true);
          const steps = lab(course).los;
          expect(steps.map((step) => step.id)).toEqual(names);
          expect(steps.map((step) => step.route)).toEqual(names.map((name) => `/lab/{{COURSEURL}}/topic-01/book-a/${name}`));
        }),
        fuzzParameters(25)
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
