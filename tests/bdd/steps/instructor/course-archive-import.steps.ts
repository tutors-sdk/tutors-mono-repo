import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect } from "vitest";
import { proposeShape, validate } from "../../../../packages/jsr/course-rules/src/mod.ts";
import { untar } from "../../../../packages/jsr/create/src/archive.ts";
import { unpackCourseArchive } from "../../../../packages/jsr/create/src/course-archive.ts";
import { diskCourse } from "../../../../packages/jsr/create/src/course-fs.ts";
import { runImport } from "../../../../packages/jsr/create/src/import-cli.ts";
import { cartridge, moodleBackup, tar } from "../../../support/course-archives.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-archive-import.feature");

describeFeature(feature, ({ Rule, AfterEachScenario }) => {
  let parent = "";
  let archive = "";
  let output = "";
  let status = -1;
  let temps: string[] = [];
  const all: string[] = [];
  afterAll(() => all.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  AfterEachScenario(() => {
    output = "";
    status = -1;
  });

  const tutorsTemps = () => readdirSync(tmpdir()).filter((name) => name.startsWith("tutors-unpacked-"));
  const save = (name: string, bytes: Uint8Array) => {
    parent = mkdtempSync(join(tmpdir(), "archive-import-"));
    all.push(parent);
    archive = join(parent, name);
    writeFileSync(archive, bytes);
    temps = tutorsTemps();
  };
  const courseDir = () => join(parent, "courses", "web-development-ii");
  const runIt = async () => {
    status = await runImport([archive, "--name", "Web Development II", "--out", join(parent, "courses")], { out: (t) => (output += t), err: (t) => (output += t) });
  };
  // The proposal tutors import made, from the same unpacked folder: link files with their text.
  const proposal = () =>
    proposeShape(
      [...unpackCourseArchive(archive.endsWith(".mbz") ? "mbz" : "imscc", new Uint8Array(readFileSync(archive)))].map(([path, bytes]) =>
        path.endsWith(".url") ? { path, text: new TextDecoder().decode(bytes) } : { path }
      )
    );
  const exits = (_ctx: unknown, code: number) => expect(status, output).toBe(code);
  const clean = async () => expect((await validate(diskCourse(courseDir()))).filter((finding) => finding.severity === "error")).toEqual([]);
  const holds = (_ctx: unknown, week: number, kind: string, file: string) => {
    const topic = proposal().topics.find((each) => each.week === week);
    expect(
      topic?.items.some((item) => item.kind === kind && item.files.includes(file)),
      JSON.stringify(topic)
    ).toBe(true);
  };
  const nothingLeft = () => expect(tutorsTemps()).toEqual(temps);

  Rule(
    "When tutors import is given a Moodle course backup, tutors shall propose the course from it with one week per section in order, leaving the general section's files for the instructor to place.",
    ({ RuleScenario }) => {
      RuleScenario("A Moodle backup with slides, a lab handout, a link and a page", ({ Given, When, Then, And }) => {
        Given("a Moodle backup of {string} with a general section and two weeks of material", () => {
          save(
            "web-dev-2.mbz",
            moodleBackup([
              { title: "", things: [{ forum: "Announcements" }, { resource: "Handbook", files: [{ name: "Course handbook.pdf", content: "%PDF handbook" }] }] },
              {
                title: "Introduction",
                things: [
                  { resource: "Lecture 1", files: [{ name: "Lecture 1 - HTML.pdf", content: "%PDF one" }] },
                  { page: "Before you start", html: "<p>Install <b>VS Code</b>.</p>" }
                ]
              },
              {
                title: "CSS & layout",
                things: [
                  { resource: "Lecture 2", files: [{ name: "Lecture 2 - CSS.pdf", content: "%PDF two" }] },
                  { url: "MDN", href: "https://developer.mozilla.org/" },
                  { folder: "Lab 2", files: [{ name: "starter.zip", content: "PK" }] }
                ]
              }
            ])
          );
        });
        When("the instructor runs tutors import on the backup", runIt);
        Then("the exit status shall be {int}", exits);
        And("the new course shall have no errors", clean);
        And("week {int} shall hold a {string} from {string}", holds);
        And("week {int} shall link to {string}", (_ctx: unknown, week: number, url: string) => {
          const topic = proposal().topics.find((each) => each.week === week);
          expect(topic?.items.find((item) => item.kind === "web")?.url).toBe(url);
          const weburls = readdirSync(courseDir(), { recursive: true }).filter((path) => String(path).endsWith("weburl"));
          expect(weburls.map((path) => readFileSync(join(courseDir(), String(path)), "utf8").trim())).toContain(url);
        });
        And("the output shall list {string} to place by hand", (_ctx: unknown, file: string) => expect(output).toContain(`  ${file}`));
        And("no unpacked files shall be left behind", nothingLeft);
      });
    }
  );

  Rule("When tutors import is given an IMS Common Cartridge, tutors shall propose the course from it with one week per module in order.", ({ RuleScenario }) => {
    RuleScenario("A cartridge with two modules", ({ Given, When, Then, And }) => {
      Given("a Common Cartridge with two modules of material", () => {
        save(
          "web-dev-2.imscc",
          cartridge([
            { title: "Module 1: Getting started", things: [{ file: "slides-1.pdf", content: "%PDF one" }, { discussion: "Introduce yourself" }] },
            {
              title: "Module 2: Forms",
              things: [
                { page: "Reading", html: "<h2>Forms</h2><p>Read this.</p>" },
                { link: "MDN forms", href: "https://developer.mozilla.org/docs/Learn/Forms" }
              ]
            }
          ])
        );
      });
      When("the instructor runs tutors import on the cartridge", runIt);
      Then("the exit status shall be {int}", exits);
      And("the new course shall have no errors", clean);
      And("week {int} shall hold a {string} from {string}", holds);
      And("week {int} shall also hold a {string} from {string}", holds);
      And("no unpacked files shall be left behind", nothingLeft);
    });
  });

  Rule("If a course export names a file outside itself, then tutors shall refuse the export and write no course.", ({ RuleScenario }) => {
    RuleScenario("A backup that reaches outside its folder", ({ Given, When, Then, And }) => {
      Given("a Moodle backup with a file named {string}", (_ctx: unknown, name: string) => {
        const backup = untar(moodleBackup([{ title: "", things: [] }]));
        save("bad.mbz", tar({ ...Object.fromEntries(backup), [name]: "%PDF" }));
      });
      When("the instructor runs tutors import on the backup", runIt);
      Then("the exit status shall be {int}", exits);
      And("the output shall say {string}", (_ctx: unknown, words: string) => expect(output).toContain(words));
      And("no course folder shall have been written", () => expect(existsSync(courseDir())).toBe(false));
      And("no unpacked files shall be left behind", nothingLeft);
    });
  });
});
