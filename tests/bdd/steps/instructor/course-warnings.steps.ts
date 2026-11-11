import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { exitCodeFor, fixCourse, MemoryFileSystem, netlifyToml, validate, type Finding, type FixOutcome } from "../../../../packages/jsr/course-rules/src/mod.ts";
import { validateFixture, type FixtureForm } from "../../../support/validate-fixtures.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-warnings.feature");

describeFeature(feature, ({ Rule }) => {
  let files: Record<string, string | Uint8Array>;
  let course: MemoryFileSystem;
  let findings: Finding[];
  let outcome: FixOutcome;

  const load = (form: string, rule: string) => {
    files = { ...validateFixture(rule, form as FixtureForm) };
    course = new MemoryFileSystem(files);
  };
  const givenFixture = (_ctx: unknown, form: string, rule: string) => load(form, rule);
  const whenValidated = async () => {
    findings = await validate(course);
  };
  const whenFixed = async () => {
    const result = await fixCourse(course);
    outcome = result;
    findings = result.findings;
  };
  const label = (f: Finding) => `${f.rule} ${f.severity} ${f.path === "" ? "<root>" : f.path}`;
  const exactly = (_ctx: unknown, expected: string) => expect(findings.map(label).sort()).toEqual(expected.split("; ").sort());
  const none = () => expect(findings).toEqual([]);
  const findingFor = (path: string) => findings.find((f) => f.path === path)!;
  const says = (_ctx: unknown, path: string, text: string) =>
    expect(
      findings
        .filter((f) => f.path === path)
        .map((f) => f.message)
        .join(" ")
    ).toContain(text);
  const suggests = (_ctx: unknown, path: string, name: string) => expect(findingFor(path).suggestedName).toBe(name);
  const equalsFixture = async (_ctx: unknown, form: string, rule: string) => {
    const expected = validateFixture(rule, form as FixtureForm);
    expect(course.paths()).toEqual(Object.keys(expected).sort());
    for (const [path, content] of Object.entries(expected)) expect(new TextDecoder().decode(await course.read(path))).toBe(content);
  };

  Rule(
    "If a typed folder's name has capitals, spaces or accents, or a file's name has spaces or accents, then tutors shall report rule V007 as a warning with the name to use instead.",
    ({ RuleScenario }) => {
      RuleScenario("A capitalised talk folder, a PDF with spaces and a note with an accent and a dash", ({ Given, When, Then, And }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("the findings shall be exactly {string}", exactly);
        And("the finding for {string} shall suggest the name {string}", suggests);
        And("the finding for {string} shall suggest the file name {string}", suggests);
      });
      RuleScenario("The same course with portable names", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("there shall be no findings", none);
      });
    }
  );

  Rule("If the .md file a card takes its title from has no title on its first line, then tutors shall report rule V008 as a warning against that file.", ({ RuleScenario }) => {
    RuleScenario("A topic with only front matter and a talk that opens with a blank line", ({ Given, When, Then }) => {
      Given("the {string} course of fixture {string}", givenFixture);
      When("the course is validated", whenValidated);
      Then("the findings shall be exactly {string}", exactly);
    });
    RuleScenario("The same cards with titles", ({ Given, When, Then }) => {
      Given("the {string} course of fixture {string}", givenFixture);
      When("the course is validated", whenValidated);
      Then("there shall be no findings", none);
    });
  });

  Rule(
    "If a page shows an image that does not exist beside it or is 2 MB or larger, then tutors shall report rule V009 as a warning against the page, once per image.",
    ({ RuleScenario }) => {
      RuleScenario("Two missing images, and an example inside a code block that is not checked", ({ Given, When, Then, And }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("the findings shall be exactly {string}", exactly);
        And("the finding for {string} shall say {string}", says);
      });
      RuleScenario("A 3 MB screenshot", ({ Given, And, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        And("the file {string} weighs {int} MB", (_ctx, path: string, megabytes: number) => {
          files[path] = new Uint8Array(megabytes * 1024 * 1024);
          course = new MemoryFileSystem(files);
        });
        When("the course is validated", whenValidated);
        Then("the findings shall be exactly {string}", exactly);
        And("the finding for {string} shall say {string}", says);
      });
      RuleScenario("Every image present and small", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("there shall be no findings", none);
      });
    }
  );

  Rule(
    "If topics side by side are not numbered, or their numbers skip or run backwards once sorted by name, then tutors shall report rule V010 as a warning against each topic out of place.",
    ({ RuleScenario }) => {
      RuleScenario("topic-1, topic-10, topic-2 and topic-intro", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("the findings shall be exactly {string}", exactly);
      });
      RuleScenario("The same topics numbered with two digits in sequence", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("there shall be no findings", none);
      });
    }
  );

  Rule(
    "If a course has no netlify.toml, or its netlify.toml does not publish the json or html folder the generator writes, then tutors shall report rule V011 as a warning.",
    ({ RuleScenario }) => {
      RuleScenario("No netlify.toml", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("the findings shall be exactly {string}", exactly);
      });
      RuleScenario("A netlify.toml that publishes the course's source folder", ({ Given, When, Then, And }) => {
        Given("the {string} course of fixture {string} with a netlify.toml that publishes {string}", (_ctx, form: string, rule: string, folder: string) => {
          load(form, rule);
          files["netlify.toml"] = `[build]\n  publish = "${folder}"\n`;
          course = new MemoryFileSystem(files);
        });
        When("the course is validated", whenValidated);
        Then("the findings shall be exactly {string}", exactly);
        And("the finding for {string} shall say {string}", says);
      });
      RuleScenario("The standard netlify.toml", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("there shall be no findings", none);
      });
    }
  );

  Rule(
    "Tutors shall write a standard netlify.toml whose build runs tutors validate before the generator, so that Netlify fails the deploy of a course with errors.",
    ({ RuleScenario }) => {
      let command = "";
      RuleScenario("The build checks the course before generating it", ({ Given, Then, And }) => {
        Given("the netlify.toml that tutors writes", () => {
          command = /^\s*command\s*=\s*"(.*)"\s*$/m.exec(netlifyToml)?.[1] ?? "";
        });
        Then("its build command shall run {string} and then {string}", (_ctx, check: string, build: string) => expect(command.split(" && ")).toEqual([check, build]));
        And("the build command shall stop at the first command that fails", () => expect(command).not.toMatch(/;|\|\|/));
      });
      RuleScenario("A course with errors fails the check that gates the deploy", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("the validate exit status shall be {int}", (_ctx, status: number) => expect(exitCodeFor(findings, false)).toBe(status));
      });
    }
  );

  Rule("If a unit, side or topic holds no learning objects, then tutors shall report rule V012 against it as a note, which no exit status counts.", ({ RuleScenario }) => {
    RuleScenario("An empty unit, side and topic", ({ Given, When, Then, And }) => {
      Given("the {string} course of fixture {string}", givenFixture);
      When("the course is validated", whenValidated);
      Then("the findings shall be exactly {string}", exactly);
      And("the course shall pass even strict checking", () => expect(exitCodeFor(findings, true)).toBe(0));
    });
    RuleScenario("Each holding something", ({ Given, When, Then }) => {
      Given("the {string} course of fixture {string}", givenFixture);
      When("the course is validated", whenValidated);
      Then("there shall be no findings", none);
    });
  });

  Rule(
    "When tutors validate runs with --fix, tutors shall apply only the safe fixes (renames for V002 and V007 other than images, and the standard netlify.toml for V011) without overwriting any existing file, then report what remains.",
    ({ RuleScenario }) => {
      RuleScenario("Fixing the V007 course gives its fixed form", ({ Given, When, Then, And }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is fixed", whenFixed);
        Then("the course shall equal the {string} course of fixture {string}", equalsFixture);
        And("there shall be no findings", none);
      });
      RuleScenario("Fixing the V011 course writes the standard netlify.toml", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is fixed", whenFixed);
        Then("the course shall equal the {string} course of fixture {string}", equalsFixture);
      });
      RuleScenario("An image is named but not renamed, because pages refer to it by name", ({ Given, When, Then, And }) => {
        Given("the {string} course of fixture {string} with an image {string}", (_ctx, form: string, rule: string, image: string) => {
          load(form, rule);
          files[image] = "PNG";
          course = new MemoryFileSystem(files);
        });
        When("the course is fixed", whenFixed);
        Then("the file {string} shall still exist", async (_ctx, path: string) => expect(await course.exists(path)).toBe(true));
        And("the findings shall include {string}", (_ctx, text: string) => expect(findings.map(label)).toContain(text));
      });
      RuleScenario("A rename onto a folder that already exists is skipped", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string} with a folder {string} already present", (_ctx, form: string, rule: string, folder: string) => {
          load(form, rule);
          files[`${folder}/talk.md`] = "# Already here\n";
          course = new MemoryFileSystem(files);
        });
        When("the course is fixed", whenFixed);
        Then("the fix of {string} shall be skipped because {string}", (_ctx, from: string, reason: string) => {
          expect(outcome.skipped.find(({ op }) => op.op === "move" && op.from === from)?.reason).toBe(reason);
        });
      });
    }
  );
});
