import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import type { Finding } from "../../../../packages/jsr/course-rules/src/mod.ts";
import { defaultSpec, writeCourseToFilesystem } from "../../../../packages/jsr/create/src/scaffolder.ts";
import { runValidate, type ValidateIo } from "../../../../packages/jsr/create/src/validate-cli.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-validation-cli.feature");

describeFeature(feature, ({ Rule, AfterEachScenario }) => {
  let dir: string;
  let out: string;
  let err: string;
  let status: number;
  let check: ValidateIo["check"];
  const temps: string[] = [];

  AfterEachScenario(() => {
    temps.splice(0).forEach((t) => rmSync(t, { recursive: true, force: true }));
    check = undefined;
  });

  const generated = () => {
    const parent = mkdtempSync(join(tmpdir(), "tutors-validate-cli-"));
    temps.push(parent);
    writeCourseToFilesystem({ ...defaultSpec, courseName: "Web Dev", courseId: "web-dev" }, parent);
    dir = join(parent, "web-dev");
  };
  const withWeek3 = () => {
    generated();
    mkdirSync(join(dir, "Week 3"));
    writeFileSync(join(dir, "Week 3", "topic.md"), "# Week 3\n");
  };
  const run = async (_ctx: unknown, flags = "") => {
    out = "";
    err = "";
    status = await runValidate([dir, ...flags.split(" ").filter(Boolean)], { out: (t) => (out += t), err: (t) => (err += t), check });
  };
  const runWith = (ctx: unknown, flags: string) => run(ctx, flags);
  const exit = (_ctx: unknown, code: number) => expect(status).toBe(code);
  const parsesAsJson = (text: string) => {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  };

  Rule(
    "When an instructor runs tutors validate on a course folder, tutors shall print each finding with its path and message and exit with status 1 if any finding is an error, else status 0.",
    ({ RuleScenario }) => {
      RuleScenario("A course with a misnamed week", ({ Given, When, Then, And }) => {
        Given("a generated course with a folder {string} holding a topic", withWeek3);
        When("the instructor runs tutors validate on it", run);
        Then("the output shall include {string}", (_ctx, text: string) => expect(out).toContain(text));
        And("the exit status shall be {int}", exit);
      });
      RuleScenario("A freshly generated course", ({ Given, When, Then, And }) => {
        Given("a generated course", generated);
        When("the instructor runs tutors validate on it", run);
        Then("the output shall be {string}", (_ctx, text: string) => expect(out).toBe(`${text}\n`));
        And("the exit status shall be {int}", exit);
      });
    }
  );

  Rule(
    "Where the format json is chosen for tutors validate, tutors shall print the findings as a JSON array of objects carrying rule, severity, path and message.",
    ({ RuleScenario }) => {
      RuleScenario("JSON for Studio and CI", ({ Given, When, Then }) => {
        Given("a generated course with a folder {string} holding a topic", withWeek3);
        When("the instructor runs tutors validate on it with {string}", runWith);
        Then("the output shall parse as a JSON array whose first item has rule {string} and path {string}", (_ctx, rule: string, path: string) => {
          const findings = JSON.parse(out) as Finding[];
          expect(findings[0]).toMatchObject({ rule, path, severity: "error" });
          expect(typeof findings[0].message).toBe("string");
        });
      });
      RuleScenario("Text when no format is chosen", ({ Given, When, Then }) => {
        Given("a generated course with a folder {string} holding a topic", withWeek3);
        When("the instructor runs tutors validate on it", run);
        Then("the output shall not parse as JSON", () => expect(parsesAsJson(out)).toBe(false));
      });
    }
  );

  Rule(
    "Where the format sarif is chosen for tutors validate, tutors shall print a SARIF 2.1.0 log with one result per finding, located at the file or folder at fault.",
    ({ RuleScenario }) => {
      RuleScenario("SARIF for code scanning", ({ Given, When, Then }) => {
        Given("a generated course with a folder {string} holding a topic", withWeek3);
        When("the instructor runs tutors validate on it with {string}", runWith);
        Then("the output shall be a SARIF 2.1.0 log with one result, rule {string} at {string}", (_ctx, rule: string, path: string) => {
          const log = JSON.parse(out);
          expect(log.version).toBe("2.1.0");
          expect(log.runs[0].results).toHaveLength(1);
          expect(log.runs[0].results[0].ruleId).toBe(rule);
          expect(log.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(`${dir}/${path}`);
        });
      });
      RuleScenario("No SARIF unless asked for", ({ Given, When, Then }) => {
        Given("a generated course with a folder {string} holding a topic", withWeek3);
        When("the instructor runs tutors validate on it with {string}", runWith);
        Then("the output shall not mention SARIF", () => expect(out).not.toMatch(/sarif/i));
      });
    }
  );

  Rule("Where strict checking is chosen for tutors validate, tutors shall exit with status 2 when the course has warnings and no errors.", ({ RuleScenario }) => {
    const onlyAWarning = () => {
      generated();
      check = async () => [{ rule: "V001", severity: "warn", path: "", message: "a warning" }];
    };
    RuleScenario("A warning fails a strict check", ({ Given, When, Then }) => {
      Given("a course whose only finding is a warning", onlyAWarning);
      When("the instructor runs tutors validate on it with {string}", runWith);
      Then("the exit status shall be {int}", exit);
    });
    RuleScenario("A warning passes an ordinary check", ({ Given, When, Then }) => {
      Given("a course whose only finding is a warning", onlyAWarning);
      When("the instructor runs tutors validate on it", run);
      Then("the exit status shall be {int}", exit);
    });
  });

  Rule("If tutors validate cannot read the course folder, then tutors shall print the reason and exit with status 3.", ({ RuleScenario }) => {
    RuleScenario("A folder that is not there", ({ Given, When, Then, And }) => {
      Given("a folder that does not exist", () => {
        dir = join(tmpdir(), "tutors-no-such-course-folder");
      });
      When("the instructor runs tutors validate on it", run);
      Then("the error output shall begin {string}", (_ctx, text: string) => expect(err.startsWith(text)).toBe(true));
      And("the exit status shall be {int}", exit);
    });
  });

  Rule(
    "If tutors validate prints a text report holding findings that its --fix option can fix, then tutors shall end the report by saying how many and naming tutors validate --fix.",
    ({ RuleScenario }) => {
      RuleScenario("A misnamed week the fix renames", ({ Given, When, Then }) => {
        Given("a generated course with a folder {string} holding a topic", withWeek3);
        When("the instructor runs tutors validate on it", run);
        Then("the output shall include {string}", (_ctx, text: string) => expect(out.trimEnd().endsWith(text)).toBe(true));
      });
      RuleScenario("A clean course says nothing about fixes", ({ Given, When, Then }) => {
        Given("a generated course", generated);
        When("the instructor runs tutors validate on it", run);
        Then("the output shall be {string}", (_ctx, text: string) => expect(out).toBe(`${text}\n`));
      });
    }
  );
});
