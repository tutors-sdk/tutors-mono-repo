import { resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import yaml from "js-yaml";
import { expect } from "vitest";
import type { DeployedRecord } from "../../../../scripts/checks/deploy-pins.ts";
import type { MutationReport } from "../../../../scripts/checks/mutation-floors.ts";
import { REPO_ROOT, readText } from "../../../../scripts/checks/lib/repo.ts";
import { jobResults, qualityRecord, type QualityRecord } from "../../../../scripts/checks/release-quality.ts";

const feature = await loadFeature("tests/bdd/features/developer/release-quality.feature");

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const PRODUCTION = "caa53d021e63004ad6e52a76428f8acd95a87c21";

interface WorkflowJob {
  needs?: string[];
  if?: string;
  permissions?: Record<string, string>;
  steps?: { run?: string }[];
}

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  let report: MutationReport | undefined;
  let deployed: DeployedRecord | undefined;
  let differing: string[];
  let jobs: Record<string, string> | undefined;
  let record: QualityRecord;
  let workflow: { permissions?: Record<string, string>; jobs: Record<string, WorkflowJob> };

  BeforeEachScenario(() => {
    report = { files: {} };
    deployed = { tag: "16.2.2", deployedAt: "2026-09-21T10:57:28Z", commit: PRODUCTION };
    differing = [];
    jobs = undefined;
  });

  const givenModule = (_ctx: unknown, killed: number, missed: number, file: string) => {
    const mutants = [...Array(killed).fill({ status: "Killed" }), ...Array(missed).fill({ status: "Survived" })];
    report = { files: { ...report?.files, [file]: { mutants } } };
  };
  const ask = (since?: string) => {
    record = qualityRecord({ commit: COMMIT, report, since, deployed, diff: () => differing, jobs, generatedAt: "2026-09-30T03:00:00Z" });
  };
  const askForRecord = () => ask();
  const givenJobs = (_ctx: unknown, list: string) => {
    jobs = jobResults(
      JSON.stringify(Object.fromEntries(list.split(",").map((pair) => pair.trim().split("=")).map(([id, result]) => [id, { result }])))
    );
  };
  const pkg = (name: string) => {
    const found = record.packages?.find((p) => p.name === name);
    expect(found, `${name} in ${JSON.stringify(record.packages)}`).toBeDefined();
    return found!;
  };
  const thenScore = (_ctx: unknown, name: string, score: number) => {
    expect(pkg(name).mutationScore).toBe(score);
  };
  const thenChanged = (_ctx: unknown, name: string) => {
    expect(pkg(name).changed).toBe(true);
  };
  const thenJob = (_ctx: unknown, id: string, result: string) => {
    expect(record.nightly?.jobs[id]).toBe(result);
  };
  const thenBase = (_ctx: unknown, base: string) => {
    expect(record.base).toBe(base);
  };
  const givenProduction = (_ctx: unknown, commit: string) => {
    deployed = { tag: "16.2.2", deployedAt: "2026-09-21T10:57:28Z", commit };
  };
  const qualityJob = (): [string, WorkflowJob] => {
    const found = Object.entries(workflow.jobs).find(([, job]) => job.steps?.some((s) => s.run?.trim().startsWith("pnpm release:quality")));
    expect(found, "a nightly job runs pnpm release:quality").toBeDefined();
    return found!;
  };

  Rule("When a maintainer asks for the quality record of a commit, tutors shall write each package's mutation score over the mutants of every module in that package.", ({ RuleScenario }) => {
    RuleScenario("Two modules of one package score as one package", ({ Given, And, When, Then }) => {
      Given("the nightly Stryker report kills {number} and misses {number} of the mutants in {string}", givenModule);
      And("the nightly Stryker report kills {number} and misses {number} of the mutants in {string}", givenModule);
      And("the nightly Stryker report also kills {number} and misses {number} of the mutants in {string}", givenModule);
      When("the maintainer asks for the quality record", askForRecord);
      Then("the quality record shall give {string} a mutation score of {number}", thenScore);
      And("the quality record shall give {string} a mutation score of {number}", thenScore);
    });
    RuleScenario("The record is one the release harness reads as a test signal", ({ Given, When, Then }) => {
      Given("the nightly Stryker report kills {number} and misses {number} of the mutants in {string}", givenModule);
      When("the maintainer asks for the quality record", askForRecord);
      Then("every package in the quality record shall have a name, a mutation score from 0 to 100 and a changed flag", () => {
        // The check the harness's parseTestSignal makes (tutors-release-harness src/score/read.ts).
        const json = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
        expect(Array.isArray(json.packages)).toBe(true);
        expect((json.packages as unknown[]).length).toBeGreaterThan(0);
        for (const p of json.packages as Record<string, unknown>[]) {
          expect(typeof p.name).toBe("string");
          expect(typeof p.mutationScore).toBe("number");
          expect(p.mutationScore as number).toBeGreaterThanOrEqual(0);
          expect(p.mutationScore as number).toBeLessThanOrEqual(100);
          expect(typeof p.changed).toBe("boolean");
        }
      });
    });
  });

  Rule("When the quality record is written, tutors shall mark a package as changed only when a file under that package's directory differs between the commit and the base, which is the production commit in release/deployed.json unless the maintainer names another.", ({ RuleScenario }) => {
    RuleScenario("A package with a changed file is changed and the others are not", ({ Given, And, When, Then }) => {
      Given("the nightly Stryker report kills {number} and misses {number} of the mutants in {string}", givenModule);
      And("the nightly Stryker report kills {number} and misses {number} of the mutants in {string}", givenModule);
      And("the files {string} differ from the base", (_ctx, list: string) => {
        differing = list.split(",").map((f) => f.trim());
      });
      When("the maintainer asks for the quality record", askForRecord);
      Then("the quality record shall mark {string} as changed", thenChanged);
      And("the quality record shall mark {string} as not changed", (_ctx, name: string) => {
        expect(pkg(name).changed).toBe(false);
      });
    });
    RuleScenario("Without a named base the record compares with production", ({ Given, When, Then }) => {
      Given("release/deployed.json names the production commit {string}", givenProduction);
      When("the maintainer asks for the quality record without naming a base", askForRecord);
      Then("the quality record shall compare with {string}", thenBase);
    });
    RuleScenario("A named base wins over production", ({ Given, When, Then }) => {
      Given("release/deployed.json names the production commit {string}", givenProduction);
      When("the maintainer asks for the quality record since {string}", (_ctx, since: string) => ask(since));
      Then("the quality record shall compare with {string}", thenBase);
    });
  });

  Rule("If no base is named and release/deployed.json names no production commit, then tutors shall mark every package in the quality record as changed.", ({ RuleScenario }) => {
    RuleScenario("With nothing to compare with, every package counts", ({ Given, And, When, Then }) => {
      Given("the nightly Stryker report kills {number} and misses {number} of the mutants in {string}", givenModule);
      And("the nightly Stryker report kills {number} and misses {number} of the mutants in {string}", givenModule);
      And("release/deployed.json is absent", () => {
        deployed = undefined;
      });
      When("the maintainer asks for the quality record without naming a base", askForRecord);
      Then("the quality record shall mark {string} as changed", thenChanged);
      And("the quality record shall mark {string} as changed", thenChanged);
    });
  });

  Rule("When the nightly workflow finishes, tutors shall publish the nightly commit's quality record with the result of every other nightly job to the quality branch as quality/<sha>.json and quality/latest.json, including on a night a job failed.", ({ RuleScenario }) => {
    RuleScenario("The record carries each nightly job's result", ({ Given, And, When, Then }) => {
      Given("the nightly Stryker report kills {number} and misses {number} of the mutants in {string}", givenModule);
      And("the nightly jobs ended {string}", givenJobs);
      When("the maintainer asks for the quality record", askForRecord);
      Then("the quality record shall list the nightly job {string} as {string}", thenJob);
      And("the quality record shall list the nightly job {string} as {string}", thenJob);
      And("the quality record shall give the night the result {string}", (_ctx, result: string) => {
        expect(record.nightly?.result).toBe(result);
      });
    });
    RuleScenario("The last nightly job publishes the record whatever the other jobs did", ({ Given, Then, And }) => {
      Given("the nightly workflow", () => {
        workflow = yaml.load(readText(resolve(REPO_ROOT, ".github/workflows/nightly.yml"))) as typeof workflow;
      });
      Then("its quality job shall wait for every other test job and run even when one failed", () => {
        const [name, job] = qualityJob();
        const others = Object.keys(workflow.jobs).filter((id) => id !== name && id !== "report");
        expect([...(job.needs ?? [])].sort()).toEqual(others.sort());
        expect(job.if).toContain("always()");
      });
      And("its quality job shall run {string} and push {string} and {string} to the {string} branch", (_ctx, command: string, perCommit: string, latest: string, branch: string) => {
        const script = (qualityJob()[1].steps ?? []).map((s) => s.run ?? "").join("\n");
        expect(script).toContain(command);
        expect(script).toContain(perCommit);
        expect(script).toContain(latest);
        expect(script).toMatch(new RegExp(`git .*push .*HEAD:${branch}\\b`));
      });
      And("only its quality job shall be allowed to write the repository's contents", () => {
        const [name] = qualityJob();
        expect(workflow.permissions).toEqual({ contents: "read" });
        const writers = Object.entries(workflow.jobs).filter(([, job]) => job.permissions?.contents === "write").map(([id]) => id);
        expect(writers).toEqual([name]);
      });
    });
  });

  Rule("If the nightly Stryker report is absent, then tutors shall write the quality record with the nightly job results and no package mutation scores.", ({ RuleScenario }) => {
    RuleScenario("A night whose mutation run wrote no report still records its jobs", ({ Given, And, When, Then }) => {
      Given("there is no nightly Stryker report", () => {
        report = undefined;
      });
      And("the nightly jobs ended {string}", givenJobs);
      When("the maintainer asks for the quality record", askForRecord);
      Then("the quality record shall have no package mutation scores", () => {
        expect(record.packages).toBeUndefined();
      });
      And("the quality record shall list the nightly job {string} as {string}", thenJob);
    });
  });
});
