import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { Ajv } from "ajv";
import { expect } from "vitest";
import { MemoryFileSystem, netlifyToml, rulesVersion, sarifReport, validate, type FileSystemPort, type Finding } from "../../../../packages/jsr/course-rules/src/mod.ts";
import { diskCourse } from "../../../../packages/jsr/create/src/course-fs.ts";
import { droppedByGen } from "../../../../scripts/checks/lib/gen-dropped.ts";
import {
  diffCourse,
  fixSettles,
  genAgreement,
  passes,
  summary,
  type BaselineCourse,
  type BaselineFinding,
  type CourseDiff,
  type GenAgreement
} from "../../../../scripts/checks/lib/validate-corpus.ts";
import { VALIDATE_RULES, validateFixture } from "../../../support/validate-fixtures.ts";

const feature = await loadFeature("tests/bdd/features/developer/validate-ci.feature");

const COMMIT = "a".repeat(40);
const sarifSchema = JSON.parse(readFileSync("tests/fixtures/sarif/sarif-schema-2.1.0.json", "utf8")) as object;

/** `^5.4.0` admits 5.4.0 up to, not including, 6.0.0; `~5.4.0` up to 5.5.0; a bare version only itself. */
function admits(range: string, version: string): boolean {
  const parse = (v: string) => v.split(".").map(Number) as [number, number, number];
  const [major, minor, patch] = parse(version);
  const operator = range[0] === "^" || range[0] === "~" ? range[0] : "";
  const [lo1, lo2, lo3] = parse(range.slice(operator.length));
  const atLeast = major > lo1 || (major === lo1 && (minor > lo2 || (minor === lo2 && patch >= lo3)));
  if (!atLeast) return false;
  if (operator === "^") return lo1 > 0 ? major === lo1 : minor === lo2;
  if (operator === "~") return major === lo1 && minor === lo2;
  return major === lo1 && minor === lo2 && patch === lo3;
}

describeFeature(feature, ({ Rule, AfterEachScenario }) => {
  let baseline: BaselineCourse | undefined;
  let diffs: CourseDiff[] = [];
  let agreements: GenAgreement[] = [];
  let fixes: Record<string, string[]> = {};
  let report = "";
  let courses: Record<string, Record<string, string>> = {};
  let sarif: string[] = [];
  let toml = "";
  let root = "";
  let check: ((fs: FileSystemPort) => Promise<Finding[]>) | undefined;
  const temps: string[] = [];

  AfterEachScenario(() => {
    temps.splice(0).forEach((t) => rmSync(t, { recursive: true, force: true }));
    baseline = undefined;
    diffs = [];
    agreements = [];
    fixes = {};
    report = "";
    courses = {};
    sarif = [];
    check = undefined;
  });

  const finding = (rule: string, severity: BaselineFinding["severity"], path: string): BaselineFinding => ({ rule, severity, path, message: `${rule} at ${path}` });
  const judge = () => {
    report = summary(diffs, agreements, fixes);
  };
  const fails = () => expect(passes(diffs, agreements, fixes)).toBe(false);
  const passesCheck = () => expect(passes(diffs, agreements, fixes), report).toBe(true);
  const lists = (_ctx: unknown, text: string) => expect(report).toContain(text);

  const warnedAt = (_ctx: unknown, rule: string, path: string) => {
    baseline = { commit: COMMIT, findings: [finding(rule, "warn", path)] };
  };
  const now = (current: BaselineFinding[]) => {
    diffs = [diffCourse("course", COMMIT, baseline, current)];
    judge();
  };
  const same = () => now(baseline!.findings);

  Rule(
    "When a change alters what tutors validate reports on a course in the validate corpus, tutors shall fail the validate corpus check and list each finding added or removed, marking each new error as one that stops the course's deploy.",
    ({ RuleScenario }) => {
      RuleScenario("A rule change adds an error to a real course", ({ Given, When, Then, And }) => {
        Given("a corpus course whose baseline has a warning {string} at {string}", warnedAt);
        When("tutors validate now also reports an error {string} at {string}", (_ctx, rule: string, path: string) => now([...baseline!.findings, finding(rule, "error", path)]));
        Then("the validate corpus check shall fail", fails);
        And("the report shall list {string}", lists);
        And("the report shall say {string}", lists);
      });
      RuleScenario("A rule change removes a finding", ({ Given, When, Then, And }) => {
        Given("a corpus course whose baseline has a warning {string} at {string}", warnedAt);
        When("tutors validate now reports nothing", () => now([]));
        Then("the validate corpus check shall fail", fails);
        And("the report shall list {string}", lists);
      });
      RuleScenario("The pin moved without a new baseline", ({ Given, When, Then, And }) => {
        Given("a corpus course whose baseline was recorded at another commit", () => {
          baseline = { commit: "b".repeat(40), findings: [finding("V007", "warn", "Week 1")] };
        });
        When("tutors validate reports the same findings", same);
        Then("the validate corpus check shall fail", fails);
        And("the report shall say {string}", lists);
      });
      RuleScenario("Nothing changed", ({ Given, When, Then }) => {
        Given("a corpus course whose baseline has a warning {string} at {string}", warnedAt);
        When("tutors validate reports the same findings", same);
        Then("the validate corpus check shall pass", passesCheck);
      });
    }
  );

  const onDisk = (_ctx: unknown, folder: string) => {
    const parent = mkdtempSync(join(tmpdir(), "tutors-validate-ci-"));
    temps.push(parent);
    root = join(parent, "course").replaceAll("\\", "/");
    const files: Record<string, string> = {
      "course.md": "# Web Development\n",
      "topic-01/topic.md": "# Week 1\n",
      "topic-01/note-01/note.md": "# Hello\n",
      [`${folder}/topic.md`]: `# ${folder}\n`
    };
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), contents);
    }
  };
  const compareWith = (findings: Finding[]) => {
    agreements = [genAgreement("course", findings, droppedByGen(root))];
    judge();
  };
  const real = () => validate(diskCourse(root));

  Rule(
    "If tutors validate and the generator disagree about which folders of a course are left out, then tutors shall fail the validate corpus check and name each folder they disagree about.",
    ({ RuleScenario }) => {
      RuleScenario("Validate misses a folder the generator drops", ({ Given, When, Then, And }) => {
        Given("a course on disk with a folder {string} holding a topic", onDisk);
        When("the check compares the generator with findings that leave out {string}", async (_ctx, path: string) => compareWith((await real()).filter((f) => f.path !== path)));
        Then("the validate corpus check shall fail", fails);
        And("the report shall list {string}", lists);
      });
      RuleScenario("Validate warns about a folder the generator builds", ({ Given, When, Then, And }) => {
        Given("a course on disk with a folder {string} holding a topic", onDisk);
        When("the check compares the generator with findings that also name {string}", async (_ctx, path: string) =>
          compareWith([...(await real()), { rule: "V018", severity: "warn", path, message: "planted" }])
        );
        Then("the validate corpus check shall fail", fails);
        And("the report shall list {string}", lists);
      });
      RuleScenario("Validate and the generator agree", ({ Given, When, Then }) => {
        Given("a course on disk with a folder {string} holding a topic", onDisk);
        When("the check compares the generator with what tutors validate reports", async () => compareWith(await real()));
        Then("the validate corpus check shall pass", passesCheck);
      });
    }
  );

  const everyFixture = () => {
    courses = Object.fromEntries(VALIDATE_RULES.map((rule) => [rule, validateFixture(rule, "broken")]));
  };

  Rule(
    "When tutors validate --fix has run on a course, tutors shall leave a course that a second --fix does not change, with every file's content kept and no rule reporting more errors than before.",
    ({ RuleScenario }) => {
      RuleScenario("Every fixture's broken course settles in one pass", ({ Given, When, Then }) => {
        Given("the broken course of every validator fixture", everyFixture);
        When("each is fixed twice", async () => {
          for (const [rule, files] of Object.entries(courses)) fixes[rule] = await fixSettles(new MemoryFileSystem(files));
          judge();
        });
        Then("no fix shall have broken the promise", () => {
          expect(Object.keys(fixes)).toHaveLength(VALIDATE_RULES.length);
          passesCheck();
        });
      });
      RuleScenario("A fix that keeps finding more to do is caught", ({ Given, When, Then }) => {
        Given("a course whose checker always plans one more rename", () => {
          courses = { course: { "course.md": "# C\n", "Week 1/topic.md": "# W\n" } };
          // Each pass renames whatever the week folder is called now, so a second pass always has work.
          check = async (fs) => {
            const week = (await fs.list("")).find((e) => e.kind === "dir")!.name;
            return [{ rule: "V002", severity: "error", path: week, message: "planted", fix: { op: "move", from: week, to: `${week}-again` } }];
          };
        });
        When("it is fixed twice", async () => {
          fixes = { course: await fixSettles(new MemoryFileSystem(courses.course), check) };
          judge();
        });
        Then("the report shall say {string}", lists);
      });
    }
  );

  const accepted = () => {
    const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
    const valid = ajv.compile(sarifSchema);
    expect(sarif.length).toBeGreaterThan(0);
    for (const log of sarif) expect(valid(JSON.parse(log)), JSON.stringify(valid.errors?.slice(0, 3))).toBe(true);
  };

  Rule("Tutors shall write a tutors validate SARIF report that the SARIF 2.1.0 JSON schema accepts, so GitHub code scanning takes every upload.", ({ RuleScenario }) => {
    RuleScenario("Every fixture's broken course", ({ Given, When, Then }) => {
      Given("the broken course of every validator fixture", everyFixture);
      When("each is validated with the format sarif", async () => {
        for (const files of Object.values(courses)) sarif.push(sarifReport(await validate(new MemoryFileSystem(files)), rulesVersion, "courses/web"));
        expect(sarif).toHaveLength(VALIDATE_RULES.length);
      });
      Then("the SARIF 2.1.0 schema shall accept every report", accepted);
    });
    RuleScenario("A course with no findings", ({ Given, When, Then }) => {
      Given("a course with no findings", () => {
        courses = { clean: validateFixture("V001", "fixed") };
      });
      When("it is validated with the format sarif", async () => {
        const findings = await validate(new MemoryFileSystem(courses.clean));
        expect(findings.filter((f) => f.severity !== "info")).toEqual([]);
        sarif.push(sarifReport([], rulesVersion, "."));
      });
      Then("the SARIF 2.1.0 schema shall accept every report", accepted);
    });
  });

  Rule(
    "Tutors shall write a standard netlify.toml naming a tutors-create version range that admits the tutors-create version this repository publishes, so a course deploys with the validate that wrote it.",
    ({ RuleScenario }) => {
      RuleScenario("The template and the package agree", ({ Given, Then }) => {
        Given("the netlify.toml that tutors writes", () => {
          toml = netlifyToml;
        });
        Then("its tutors-create range shall admit the version in packages/jsr/create/deno.json", () => {
          const range = /jsr:@tutors\/tutors-create@([~^]?\d+\.\d+\.\d+)/.exec(toml)?.[1];
          expect(range, "the standard netlify.toml names no tutors-create version").toBeDefined();
          const { version } = JSON.parse(readFileSync("packages/jsr/create/deno.json", "utf8")) as { version: string };
          expect(admits(range!, version), `${range} does not admit tutors-create ${version}`).toBe(true);
          // The guard itself: a range is not a rubber stamp.
          expect(admits("^5.4.0", "5.3.0")).toBe(false);
          expect(admits("^5.4.0", "6.0.0")).toBe(false);
        });
      });
    }
  );
});
