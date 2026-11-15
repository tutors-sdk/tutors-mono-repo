import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { compressToZip, copyFileToFolder, zipEntryNames } from "../../../../packages/jsr/gen/src/utils/file-utils.ts";

const feature = await loadFeature("tests/bdd/features/generator/rebuild.feature");

/** A moment well before now, so a file the scenario changes afterwards is plainly newer. */
const earlier = new Date(Date.now() - 60_000);

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Rule }) => {
  let root: string;
  let course: string;
  let built: string;
  let pdfs: string[];
  let rebuild: () => Promise<void>;

  BeforeEachScenario(() => {
    root = mkdtempSync(join(tmpdir(), "tutors-rebuild-"));
    course = join(root, "course");
    built = join(root, "json");
    mkdirSync(course);
    pdfs = [];
  });
  AfterEachScenario(() => rmSync(root, { recursive: true, force: true }));

  /** Writes a course file whose modified time is a minute ago. */
  const write = (name: string, text: string) => {
    writeFileSync(join(course, name), text);
    utimesSync(join(course, name), earlier, earlier);
  };
  const change = (name: string) => writeFileSync(join(course, name), `${readFileSync(join(course, name), "utf8")} and a change`);
  const zip = () => join(built, "llms", "course-complete-pdfs.zip");

  Rule(
    "When tutors builds a course into a folder that already holds an earlier build, tutors shall copy only the course files that are new or have changed since that build.",
    ({ RuleScenario }) => {
      const copiedEarlier = (_: unknown, name: string) => {
        write(name, `${name} as first written`);
        copyFileToFolder(join(course, name), built);
        rebuild = async () => {
          for (const file of ["week-1.pdf", "week-2.pdf"]) if (existsSync(join(course, file))) copyFileToFolder(join(course, file), built);
        };
      };
      const builtAgain = () => rebuild();

      RuleScenario("An unchanged file is not copied again", ({ Given, When, Then }) => {
        Given("a course file {string} copied by an earlier build", (_, name: string) => {
          copiedEarlier(_, name);
          // Mark the copy, keeping its size and modified time: a copy made again would overwrite the mark.
          const copy = join(built, name);
          writeFileSync(copy, readFileSync(copy, "utf8").replace("first", "FIRST"));
          utimesSync(copy, earlier, earlier);
        });
        When("the course is built again", builtAgain);
        Then("the build left the copy of {string} as it was", (_, name: string) => {
          expect(readFileSync(join(built, name), "utf8")).toBe(`${name} as FIRST written`);
        });
      });

      RuleScenario("A changed file is copied", ({ Given, And, When, Then }) => {
        Given("a course file {string} copied by an earlier build", copiedEarlier);
        And("the lecturer has changed {string}", (_, name: string) => change(name));
        When("the course is built again", builtAgain);
        Then("the copy of {string} holds the change", (_, name: string) => {
          expect(readFileSync(join(built, name), "utf8")).toBe(`${name} as first written and a change`);
        });
      });

      RuleScenario("A new file is copied", ({ Given, And, When, Then }) => {
        Given("a course file {string} copied by an earlier build", copiedEarlier);
        And("the lecturer has added {string}", (_, name: string) => writeFileSync(join(course, name), `${name} as written`));
        When("the course is built again", builtAgain);
        Then("the copy of {string} holds what the lecturer wrote", (_, name: string) => {
          expect(readFileSync(join(built, name), "utf8")).toBe(`${name} as written`);
        });
      });
    }
  );

  Rule(
    "When tutors builds a course's PDF zip into a folder that already holds it, tutors shall write the zip again only if one of its PDFs was added, removed or changed since it was written.",
    ({ RuleScenario }) => {
      /** When the earlier build wrote the zip: after its PDFs, before now. */
      const zipped = new Date(earlier.getTime() + 1000);
      const zippedEarlier = async (_: unknown, first: string, second: string) => {
        for (const name of [first, second]) write(name, `the talk ${name}`);
        pdfs = [first, second].map((name) => join(course, name));
        await compressToZip(pdfs, zip());
        utimesSync(zip(), zipped, zipped);
        rebuild = () => compressToZip(pdfs, zip());
      };
      const builtAgain = () => rebuild();
      const zipWrittenAt = () => statSync(zip()).mtime.getTime();

      RuleScenario("Unchanged PDFs leave the zip as it was", ({ Given, When, Then }) => {
        Given("a PDF zip of {string} and {string} written by an earlier build", zippedEarlier);
        When("the course is built again", builtAgain);
        Then("the build left the zip as it was", () => expect(zipWrittenAt()).toBe(zipped.getTime()));
      });

      RuleScenario("A changed PDF writes the zip again", ({ Given, And, When, Then }) => {
        Given("a PDF zip of {string} and {string} written by an earlier build", zippedEarlier);
        And("the lecturer has changed {string}", (_, name: string) => change(name));
        When("the course is built again", builtAgain);
        Then("the build wrote the zip again", () => expect(zipWrittenAt()).toBeGreaterThan(zipped.getTime()));
      });

      RuleScenario("An added PDF is zipped", ({ Given, And, When, Then }) => {
        Given("a PDF zip of {string} and {string} written by an earlier build", zippedEarlier);
        And("the lecturer has added the talk PDF {string}", (_, name: string) => {
          write(name, `the talk ${name}`);
          pdfs = [...pdfs, join(course, name)];
        });
        When("the course is built again", builtAgain);
        Then("the zip holds {string}", (_, names: string) => {
          expect([...(zipEntryNames(zip()) ?? [])].sort()).toEqual(names.split(", ").sort());
        });
      });
    }
  );
});
