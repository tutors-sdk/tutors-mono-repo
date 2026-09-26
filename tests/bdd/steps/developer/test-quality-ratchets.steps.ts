import { matchesGlob } from "node:path";
import { resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import yaml from "js-yaml";
import { expect } from "vitest";
import vitestConfig from "../../../../vitest.config.ts";
import {
  FLOORS_PATH,
  coverageFloorFindings,
  raisedFloors,
  type CoverageFloors,
  type CoverageSummary,
  type Metric
} from "../../../../scripts/checks/coverage-floors.ts";
import {
  MUTATION_FLOORS_PATH,
  mutationFloorFindings,
  type MutationFloors,
  type MutationReport
} from "../../../../scripts/checks/mutation-floors.ts";
import { REPO_ROOT, readText } from "../../../../scripts/checks/lib/repo.ts";

const feature = await loadFeature("tests/bdd/features/developer/test-quality-ratchets.feature");

type Coverage = NonNullable<NonNullable<typeof vitestConfig.test>["coverage"]> & {
  include: string[];
  exclude: string[];
  thresholds: Record<string, unknown>;
};

const METRIC_WORDS: Record<string, Metric> = { statement: "statements", line: "lines", branch: "branches", function: "functions" };

const recordedCoverageFloors = (): CoverageFloors => JSON.parse(readText(FLOORS_PATH));
const recordedMutationFloors = (): MutationFloors => JSON.parse(readText(MUTATION_FLOORS_PATH));
const strykerConfig = () => JSON.parse(readText(resolve(REPO_ROOT, "stryker.config.json")));

interface NightlyJob {
  needs?: string[];
  steps?: { run?: string; if?: string }[];
}

/** A coverage summary with one file per scope and a total, every metric at 100% unless set. */
function summaryWith(total: Partial<Record<Metric, number>>, scopes: Record<string, Partial<Record<Metric, number>>>): CoverageSummary {
  // Ten thousand units per metric, so a percentage with one decimal is exact.
  const entry = (pct: Partial<Record<Metric, number>>) =>
    Object.fromEntries(
      (["statements", "branches", "functions", "lines"] as Metric[]).map((m) => {
        const value = pct[m] ?? 100;
        return [m, { total: 10000, covered: Math.round(value * 100), pct: value }];
      })
    ) as CoverageSummary[string];
  const summary: CoverageSummary = { total: entry(total) };
  for (const [prefix, pct] of Object.entries(scopes)) summary[resolve(REPO_ROOT, prefix, "module.ts")] = entry(pct);
  return summary;
}

describeFeature(feature, ({ Rule }) => {
  const coverage = () => vitestConfig.test!.coverage as Coverage;
  const measured = (file: string) =>
    coverage().include.some((g) => matchesGlob(file, g)) && !coverage().exclude.some((g) => matchesGlob(file, g));

  // Shared state for the floor scenarios: floors in force, what was measured, what the check said.
  let floors: CoverageFloors;
  let summary: CoverageSummary;
  let mutationFloors: MutationFloors;
  let report: MutationReport;

  const allAtFloor = (f: CoverageFloors) =>
    summaryWith(
      f.global,
      Object.fromEntries(Object.entries(f.packages).map(([scope, v]) => [scope.slice(0, -"/**".length), v]))
    );

  const givenPackageFloor = (_ctx: unknown, scope: string, metric: string, floor: number) => {
    floors = recordedCoverageFloors();
    floors.packages[scope] = { ...floors.packages[scope], [METRIC_WORDS[metric] ?? metric]: floor };
    summary = allAtFloor(floors);
  };
  const measurePackage = (_ctx: unknown, metric: string, prefix: string, pct: number) => {
    const file = resolve(REPO_ROOT, prefix, "module.ts");
    const m = METRIC_WORDS[metric];
    summary[file] = { ...summary[file], [m]: { total: 10000, covered: Math.round(pct * 100), pct } };
  };
  const reports = (_ctx: unknown, finding: string) => {
    expect(coverageFloorFindings(summary, floors)).toContain(finding);
  };
  const configuration = () => {
    expect(coverage().include.length).toBeGreaterThan(0);
  };

  Rule(
    "Tutors shall measure test coverage over every TypeScript source file under the packages and app source directories, including files that no test imports.",
    ({ RuleScenario }) => {
      RuleScenario("A module no test imports is inside the coverage measure", ({ Given, Then, And }) => {
        const isMeasured = (_ctx: unknown, file: string) => expect(measured(file), file).toBe(true);
        Given("the repository's coverage configuration", configuration);
        Then("the scaffolder source file {string} shall be measured", isMeasured);
        And("the time dashboard source file {string} shall be measured", isMeasured);
        And("the course package source file {string} shall be measured", isMeasured);
      });

      RuleScenario("Test files and generated files stay out of the measure", ({ Given, Then, And }) => {
        const notMeasured = (_ctx: unknown, file: string) => expect(measured(file), file).toBe(false);
        Given("the repository's coverage configuration", configuration);
        Then("the test file {string} shall not be measured", notMeasured);
        And("the generated file {string} shall not be measured", notMeasured);
        And("the declaration file {string} shall not be measured", notMeasured);
      });
    }
  );

  Rule(
    "If total or per-package test coverage falls below its recorded floor, then tutors shall fail the coverage check and name the scope and metric.",
    ({ RuleScenario }) => {
      RuleScenario("A package below its floor fails the check", ({ Given, When, Then }) => {
        Given("recorded coverage floors where {string} holds {word} at {number} percent", givenPackageFloor);
        When("the measured {word} coverage of {string} is {number} percent", measurePackage);
        Then("the coverage check shall report {string}", reports);
      });

      RuleScenario("The total below its floor fails the check", ({ Given, When, Then }) => {
        Given("recorded coverage floors where the total holds {word} at {number} percent", (_ctx, metric: string, floor: number) => {
          floors = recordedCoverageFloors();
          floors.global = { ...floors.global, [metric]: floor };
          summary = allAtFloor(floors);
        });
        When("the measured total {word} coverage is {number} percent", (_ctx, metric: string, pct: number) => {
          summary.total = { ...summary.total, [METRIC_WORDS[metric]]: { total: 10000, covered: Math.round(pct * 100), pct } };
        });
        Then("the coverage check shall report {string}", reports);
      });

      RuleScenario("The coverage run enforces the recorded floors", ({ Given, Then }) => {
        Given("the repository's coverage configuration", configuration);
        Then("its coverage thresholds shall equal the recorded coverage floors", () => {
          const recorded = recordedCoverageFloors();
          expect(coverage().thresholds).toEqual({ ...recorded.global, ...recorded.packages });
        });
      });
    }
  );

  Rule(
    "If measured test coverage is 2 or more points above its recorded floor, then tutors shall fail the coverage check until the floor is raised.",
    ({ RuleScenario }) => {
      RuleScenario("Coverage that rose past the margin demands a raised floor", ({ Given, When, Then }) => {
        Given("recorded coverage floors where {string} holds {word} at {number} percent", givenPackageFloor);
        When("the measured {word} coverage of {string} is {number} percent", measurePackage);
        Then("the coverage check shall report {string}", reports);
      });

      RuleScenario("Coverage within the margin passes", ({ Given, When, Then }) => {
        Given("recorded coverage floors where {string} holds {word} at {number} percent", givenPackageFloor);
        When("the measured {word} coverage of {string} is {number} percent", measurePackage);
        Then("the coverage check shall report nothing for {string}", (_ctx, scope: string) => {
          expect(coverageFloorFindings(summary, floors).filter((f) => f.includes(scope))).toEqual([]);
        });
      });

      RuleScenario("Updating the floors raises them and never lowers one", ({ Given, When, Then, And }) => {
        const update = () => {
          floors = raisedFloors(summary, floors);
        };
        const floorIs = (_ctx: unknown, metric: string, scope: string, expected: number) => {
          expect(floors.packages[scope][METRIC_WORDS[metric]]).toBe(expected);
        };
        Given("recorded coverage floors where {string} holds {word} at {number} percent", givenPackageFloor);
        When("the measured {word} coverage of {string} is {number} percent", measurePackage);
        And("the floors are updated from the measurement", update);
        Then("the {word} floor of {string} shall be {number}", floorIs);
        When("the measured {word} coverage of {string} later falls to {number} percent", measurePackage);
        And("the floors are updated again", update);
        Then("the {word} floor of {string} shall still be {number}", floorIs);
      });
    }
  );

  Rule(
    "When the nightly workflow runs, tutors shall run mutation testing and fail the nightly run if the mutation score is below the break threshold of 85 percent.",
    ({ RuleScenario }) => {
      RuleScenario("The nightly workflow runs mutation testing and its failure fails the night", ({ Given, Then, And }) => {
        let jobs: Record<string, NightlyJob>;
        let mutationJob: string;
        Given("the nightly workflow", () => {
          const workflow = yaml.load(readText(resolve(REPO_ROOT, ".github/workflows/nightly.yml"))) as { jobs: Record<string, NightlyJob> };
          jobs = workflow.jobs;
        });
        Then("it shall have a job that runs {string}", (_ctx, command: string) => {
          const found = Object.entries(jobs).find(([, job]) => job.steps?.some((s) => s.run?.trim() === command));
          expect(found, `no nightly job runs ${command}`).toBeDefined();
          mutationJob = found![0];
        });
        And("the job that reports the night shall fail when the mutation job fails", () => {
          const reportJob = jobs.report;
          expect(reportJob.needs).toContain(mutationJob);
          const failStep = reportJob.steps?.find((s) => s.run?.trim() === "exit 1");
          expect(failStep?.if).toContain(`needs.${mutationJob}.result == 'failure'`);
        });
      });

      RuleScenario("Stryker breaks below 85 percent", ({ Given, Then, And }) => {
        Given("the Stryker configuration", () => {
          expect(strykerConfig().testRunner).toBe("vitest");
        });
        Then("its break threshold shall be at least {number}", (_ctx, minimum: number) => {
          expect(strykerConfig().thresholds.break).toBeGreaterThanOrEqual(minimum);
        });
        And("it shall write a JSON report", () => {
          expect(strykerConfig().reporters).toContain("json");
        });
      });
    }
  );

  Rule(
    "If a mutated module's mutation score is below its recorded floor, then tutors shall fail the mutation floor check and name the module.",
    ({ RuleScenario }) => {
      const givenFloor = (_ctx: unknown, floor: number, file: string) => {
        mutationFloors = { staleMargin: recordedMutationFloors().staleMargin, files: { [file]: floor } };
        report = { files: { [file]: { mutants: Array.from({ length: 100 }, () => ({ status: "Killed" })) } } };
        // Start at the floor exactly, so only the When step moves the score.
        report.files[file].mutants.splice(0, 100 - floor, ...Array.from({ length: 100 - floor }, () => ({ status: "Survived" })));
      };
      const strykerRun = (_ctx: unknown, killed: number, missed: number, file: string) => {
        report.files[file] = {
          mutants: [
            ...Array.from({ length: killed }, () => ({ status: "Killed" })),
            ...Array.from({ length: missed }, (_, i) => ({ status: i % 2 ? "Survived" : "NoCoverage" }))
          ]
        };
      };
      const mutationReports = (_ctx: unknown, finding: string) => {
        expect(mutationFloorFindings(report, mutationFloors)).toContain(finding);
      };

      RuleScenario("A module below its floor fails the check", ({ Given, When, Then }) => {
        Given("a recorded mutation floor of {number} percent for {string}", givenFloor);
        When("Stryker kills {number} and misses {number} of the mutants in {string}", strykerRun);
        Then("the mutation floor check shall report {string}", mutationReports);
      });

      RuleScenario("A module whose score rose past the margin demands a raised floor", ({ Given, When, Then }) => {
        Given("a recorded mutation floor of {number} percent for {string}", givenFloor);
        When("Stryker kills {number} and misses {number} of the mutants in {string}", strykerRun);
        Then("the mutation floor check shall report {string}", mutationReports);
      });

      RuleScenario("A mutated module with no floor fails the check", ({ Given, When, Then }) => {
        Given("a recorded mutation floor of {number} percent for {string}", givenFloor);
        When("Stryker kills {number} and misses {number} of the mutants in {string}", strykerRun);
        Then("the mutation floor check shall report {string}", mutationReports);
      });

      RuleScenario("Every module Stryker mutates has a recorded floor", ({ Given, Then }) => {
        Given("the Stryker configuration", () => {
          expect(strykerConfig().testRunner).toBe("vitest");
        });
        Then("every module it mutates shall have a recorded mutation floor", () => {
          const floored = Object.keys(recordedMutationFloors().files).sort();
          expect(floored).toEqual([...strykerConfig().mutate].sort());
        });
      });
    }
  );
});
