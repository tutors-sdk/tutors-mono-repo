import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { runCli } from "../../../../packages/jsr/create/src/cli.ts";
import { defaultSpec, generateCourseFiles, writeCourseToFilesystem, type CourseSpec } from "../../../../packages/jsr/create/src/scaffolder.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-scaffolding.feature");

const specFor = (courseId: string): CourseSpec => ({ ...defaultSpec, courseName: courseId, courseId });

// Every file under a folder, as paths relative to it.
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();
}

describeFeature(feature, ({ Rule, AfterEachScenario }) => {
  let out: string;
  let thrown: unknown;
  const before = new Map<string, string[]>();
  let stdout: string;
  let stderr: string;

  AfterEachScenario(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.exitCode = undefined;
    if (out) rmSync(out, { recursive: true, force: true });
  });

  const givenEmptyOutput = () => {
    out = mkdtempSync(join(tmpdir(), "tutors-create-"));
    thrown = undefined;
    before.clear();
  };
  const scaffold = (_ctx: unknown, courseId: string) => {
    for (const name of readdirSync(out)) {
      try {
        before.set(name, filesUnder(join(out, name)));
      } catch {
        // a regular file or a link, not a folder to list
      }
    }
    try {
      writeCourseToFilesystem(specFor(courseId), out);
    } catch (error) {
      thrown = error;
    }
  };
  const scaffolded = (_ctx: unknown, courseId: string) => writeCourseToFilesystem(specFor(courseId), out);
  const refused = (_ctx: unknown, folder: string) => {
    expect(thrown, "the scaffolder refused").toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain(`${join(out, folder)} already exists`);
  };
  const stillReads = (_ctx: unknown, file: string, text: string) => expect(readFileSync(join(out, file), "utf-8")).toBe(text);
  const noNewFiles = (_ctx: unknown, folder: string) => expect(filesUnder(join(out, folder))).toEqual(before.get(folder));

  Rule(
    "If the destination folder of a new course already exists, then tutors shall refuse to create the course and leave every file at that destination byte-for-byte unchanged.",
    ({ RuleScenario }) => {
      RuleScenario("A fresh destination receives the generated course", ({ Given, When, Then }) => {
        Given("an empty output folder", givenEmptyOutput);
        When("the course {string} is scaffolded into the output folder", scaffold);
        Then("the folder {string} shall hold the generated course files", (_ctx, folder: string) => {
          expect(thrown).toBeUndefined();
          const expected = generateCourseFiles(specFor(folder)).map((file) => join(file.relativePath));
          expect(filesUnder(join(out, folder))).toEqual(expected.sort());
        });
      });

      RuleScenario("Re-scaffolding an edited course keeps the author's text", ({ Given, And, When, Then }) => {
        Given("an empty output folder", givenEmptyOutput);
        And("the course {string} has been scaffolded into the output folder", scaffolded);
        And("the author has replaced {string} with {string}", (_ctx, file: string, text: string) => writeFileSync(join(out, file), text));
        And("the author has also replaced {string} with {string}", (_ctx, file: string, text: string) => writeFileSync(join(out, file), text));
        When("the course {string} is scaffolded into the output folder", scaffold);
        Then("the scaffolding shall be refused naming the folder {string}", refused);
        And("{string} shall still read {string}", stillReads);
        And("{string} shall also still read {string}", stillReads);
        And("the folder {string} shall hold no file it did not hold before", noNewFiles);
      });

      RuleScenario("A regular file at the destination is not replaced", ({ Given, And, When, Then }) => {
        Given("an empty output folder", givenEmptyOutput);
        And("the output folder holds a file {string} reading {string}", (_ctx, file: string, text: string) => writeFileSync(join(out, file), text));
        When("the course {string} is scaffolded into the output folder", scaffold);
        Then("the scaffolding shall be refused naming the folder {string}", refused);
        And("{string} shall still read {string}", stillReads);
      });

      RuleScenario("A symbolic link at the destination is not followed", ({ Given, And, When, Then }) => {
        Given("an empty output folder", givenEmptyOutput);
        And("the output folder holds a folder {string} containing {string} reading {string}", (_ctx, folder: string, file: string, text: string) => {
          mkdirSync(join(out, folder));
          writeFileSync(join(out, folder, file), text);
        });
        And("the output folder holds a symbolic link {string} to {string}", (_ctx, link: string, target: string) => symlinkSync(join(out, target), join(out, link), "dir"));
        When("the course {string} is scaffolded into the output folder", scaffold);
        Then("the scaffolding shall be refused naming the folder {string}", refused);
        And("{string} shall still read {string}", stillReads);
        And("the folder {string} shall hold no file it did not hold before", noNewFiles);
      });

      RuleScenario("A folder another creator has just claimed is not written into", ({ Given, And, When, Then }) => {
        Given("an empty output folder", givenEmptyOutput);
        And("another creator has just created the empty folder {string}", (_ctx, folder: string) => mkdirSync(join(out, folder)));
        When("the course {string} is scaffolded into the output folder", scaffold);
        Then("the scaffolding shall be refused naming the folder {string}", refused);
        And("the folder {string} shall hold no file it did not hold before", noNewFiles);
      });
    }
  );

  Rule(
    "If the course name typed into the course creator names a folder that already exists, then tutors shall print the conflicting folder path, print no publishing steps and exit with a failure status.",
    ({ RuleScenario }) => {
      RuleScenario("The creator reports the clash and stops", ({ Given, And, When, Then }) => {
        Given("an empty output folder", givenEmptyOutput);
        And("the course {string} has been scaffolded into the output folder", scaffolded);
        When("an instructor runs the course creator in the output folder and names the course {string}", (_ctx, name: string) => {
          stdout = "";
          stderr = "";
          // The course name is the only required answer; every other prompt takes its default.
          let asked = 0;
          vi.stubGlobal("prompt", () => (asked++ === 0 ? name : null));
          vi.spyOn(process.stdout, "write").mockImplementation((chunk) => ((stdout += String(chunk)), true));
          vi.spyOn(process.stderr, "write").mockImplementation((chunk) => ((stderr += String(chunk)), true));
          runCli(out);
        });
        Then("the creator shall print an error naming the folder {string}", (_ctx, folder: string) => {
          expect(stderr).toContain(join(out, folder));
        });
        And("the creator shall print no publishing steps", () => {
          expect(stdout).not.toContain("Next steps:");
        });
        And("the creator shall exit with a failure status", () => {
          expect(process.exitCode).toBe(1);
        });
      });
    }
  );
});
