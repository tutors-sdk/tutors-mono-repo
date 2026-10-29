import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { copyAssets, generateStaticCourse, parseCourse } from "../../../../packages/jsr/gen/src/tutors.ts";
import { runTutorsLite } from "../../../../packages/jsr/tutors-lite/src/run.ts";

const feature = await loadFeature("tests/bdd/features/generator/static-build.feature");

const ventoFolder = resolve(__dirname, "../../../../packages/jsr/gen/src/templates/vento");

describeFeature(feature, ({ AfterEachScenario, Rule }) => {
  let root: string;
  let exitCode: number;
  let stderr: string;
  let copied: boolean;

  AfterEachScenario(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function writeCourse(files: Record<string, string>) {
    root = mkdtempSync(join(tmpdir(), "tutors-lite-bdd-"));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
  }

  function givenCourse(_ctx: unknown, image: string) {
    writeCourse({ "course.md": "# Course\nA course\n", "topic-01/topic.md": "# Topic 1\nA topic\n", [image]: "png" });
  }

  async function build(srcVentoFolder: string) {
    stderr = "";
    copied = false;
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    exitCode = await runTutorsLite(root, srcVentoFolder, {
      parseCourse: (folder) => parseCourse(folder, true),
      generateStaticCourse,
      copyAssets: (lr, folder) => {
        copied = true;
        copyAssets(lr, folder);
      }
    });
  }

  const buildWithOwnTemplates = () => build(ventoFolder);
  const exitsWith = (_ctx: unknown, code: number) => expect(exitCode, stderr).toBe(code);

  Rule(
    "If static generation of a course fails, then tutors shall end the tutors-lite build with a nonzero exit status and leave the course's assets uncopied.",
    ({ RuleScenario }) => {
      RuleScenario("Templates that cannot be loaded fail the build", ({ Given, When, Then, And }) => {
        Given("a course folder holding course.md, a topic and the image {string}", givenCourse);
        When("tutors-lite builds the course with templates from a folder that does not exist", () => build(join(root, "no-such-templates")));
        Then("the build ends with exit status {number}", exitsWith);
        And("no assets are copied into html/", () => {
          expect(copied).toBe(false);
          expect(existsSync(join(root, "html/topic-01/topic.png"))).toBe(false);
        });
      });

      RuleScenario("A completed build copies the assets and exits zero", ({ Given, When, Then, And }) => {
        Given("a course folder holding course.md, a topic and the image {string}", givenCourse);
        When("tutors-lite builds the course with its own templates", buildWithOwnTemplates);
        Then("the build ends with exit status {number}", exitsWith);
        And("{string} is in the course folder", (_ctx, file: string) => {
          expect(existsSync(join(root, file))).toBe(true);
        });
      });
    }
  );

  Rule(
    "If the folder tutors-lite runs in holds no course.md, then tutors shall end the build with a nonzero exit status and report that course.md cannot be located.",
    ({ RuleScenario }) => {
      RuleScenario("A folder without course.md fails the build", ({ Given, When, Then, And }) => {
        Given("a course folder with no course.md", () => writeCourse({ "topic-01/topic.md": "# Topic 1\nA topic\n" }));
        When("tutors-lite builds the course with its own templates", buildWithOwnTemplates);
        Then("the build ends with exit status {number}", exitsWith);
        And("the build reports {string}", (_ctx, message: string) => {
          expect(stderr).toContain(message);
        });
        And("no html/ folder is written", () => {
          expect(existsSync(join(root, "html"))).toBe(false);
        });
      });
    }
  );
});
