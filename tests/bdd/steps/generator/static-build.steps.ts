import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { copyAssets, generateStaticCourse, parseCourse } from "../../../../packages/jsr/gen/src/tutors.ts";
import { ventoTemplates } from "../../../../packages/jsr/gen/src/templates/vento-templates.ts";
import { runTutorsLite } from "../../../../packages/jsr/tutors-lite/src/run.ts";
import { versionLine } from "../../../../packages/jsr/tutors-lite/src/version.ts";

const feature = await loadFeature("tests/bdd/features/generator/static-build.feature");

const ventoFolder = resolve(__dirname, "../../../../packages/jsr/gen/src/templates/vento");
const tutorsLiteDir = resolve(__dirname, "../../../../packages/jsr/tutors-lite");

/** Every file under `dir`, keyed by its path relative to `dir` with forward slashes. */
function filesUnder(dir: string, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, filesUnder(join(dir, entry.name), rel));
    else out[rel] = readFileSync(join(dir, entry.name), "utf8");
  }
  return out;
}

describeFeature(feature, ({ AfterEachScenario, Rule }) => {
  let root: string;
  let exitCode: number;
  let stderr: string;
  let copied: boolean;
  let fetchCalls: number;

  AfterEachScenario(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (root) rmSync(root, { recursive: true, force: true });
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

  Rule(
    "When tutors-lite builds a course, tutors shall render it with the templates bundled into its own release, without fetching templates over the network.",
    ({ RuleScenario }) => {
      RuleScenario("A build with no template folder uses the bundled templates and never touches the network", ({ Given, When, Then, And }) => {
        Given("a course folder holding course.md, a topic and the image {string}", givenCourse);
        When("tutors-lite builds the course with no template folder while the network is unavailable", async () => {
          fetchCalls = 0;
          vi.stubGlobal("fetch", () => {
            fetchCalls++;
            return Promise.reject(new Error("network unavailable"));
          });
          await build("");
        });
        Then("the build ends with exit status {number}", exitsWith);
        And("no request is made over the network", () => {
          expect(fetchCalls).toBe(0);
        });
        And("the templates written for the build are the bundled templates, file for file", () => {
          expect(filesUnder(join(root, "html/vento"))).toEqual(ventoTemplates);
        });
      });

      RuleScenario("The bundled templates are the template files in the generator", ({ Given, Then }) => {
        let files: Record<string, string>;
        Given("the template files under packages/jsr/gen/src/templates/vento", () => {
          root = "";
          files = filesUnder(ventoFolder);
          expect(Object.keys(files).length).toBeGreaterThan(0);
        });
        Then("the bundled template module is generated from exactly those files", () => {
          // Compared as data, not file bytes: Stryker rewrites the module in place while it mutates.
          expect(ventoTemplates, "run pnpm generate:vento-templates").toEqual(files);
        });
      });
    }
  );

  Rule("When tutors-lite finishes a build, tutors shall report the version named in tutors-lite's own package manifest.", ({ RuleScenario }) => {
    RuleScenario("The version line names the manifest's version", ({ Given, Then, And }) => {
      let manifestVersion: string;
      Given("the tutors-lite package manifest", () => {
        root = "";
        manifestVersion = JSON.parse(readFileSync(join(tutorsLiteDir, "deno.json"), "utf8")).version;
        expect(manifestVersion).toMatch(/^\d+\.\d+\.\d+/);
      });
      Then("the version line tutors-lite prints names the manifest's version", () => {
        expect(versionLine).toBe(`tutors-lite: ${manifestVersion}`);
      });
      And("no tutors-lite source file names a version of its own", () => {
        const sources = { "main.ts": readFileSync(join(tutorsLiteDir, "main.ts"), "utf8"), ...filesUnder(join(tutorsLiteDir, "src")) };
        for (const [name, text] of Object.entries(sources)) {
          expect(text, name).not.toMatch(/\b\d+\.\d+\.\d+\b/);
        }
      });
    });
  });
});
