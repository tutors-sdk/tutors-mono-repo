import { matchesGlob } from "node:path";
import { resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import yaml from "js-yaml";
import { expect } from "vitest";
import vitestConfig from "../../../../vitest.config.ts";
import mutationConfig from "../../../../vitest.config.mutation.ts";
import nightlyMutationConfig from "../../../../vitest.config.mutation-nightly.ts";
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
  NIGHTLY_MUTATION_FLOORS_PATH,
  failingFindings,
  mutationFloorFindings,
  mutationSummary,
  type MutationFloors,
  type MutationReport
} from "../../../../scripts/checks/mutation-floors.ts";
import { REPO_ROOT, readText, toPosix, walk } from "../../../../scripts/checks/lib/repo.ts";

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
const nightlyStrykerConfig = () => JSON.parse(readText(resolve(REPO_ROOT, "stryker.nightly.config.json")));
const recordedNightlyFloors = (): MutationFloors => JSON.parse(readText(NIGHTLY_MUTATION_FLOORS_PATH));
const nightlyJobs = () =>
  (yaml.load(readText(resolve(REPO_ROOT, ".github/workflows/nightly.yml"))) as { jobs: Record<string, NightlyJob> }).jobs;

/** Whether Stryker's mutate list selects `file`: a positive glob matches and no `!` glob does. */
function strykerMutates(mutate: string[], file: string): boolean {
  const excluded = mutate.filter((g) => g.startsWith("!")).map((g) => g.slice(1));
  return mutate.some((g) => !g.startsWith("!") && matchesGlob(file, g)) && !excluded.some((g) => matchesGlob(file, g));
}

interface NightlyJob {
  needs?: string[];
  steps?: { run?: string; if?: string }[];
}

/** The nightly job with a step that runs `command`, and that step's index. */
function jobRunning(jobs: Record<string, NightlyJob>, command: string): { name: string; job: NightlyJob; at: number } {
  for (const [name, job] of Object.entries(jobs)) {
    const at = job.steps?.findIndex((s) => s.run?.trim() === command) ?? -1;
    if (at >= 0) return { name, job, at };
  }
  throw new Error(`no nightly job runs ${command}`);
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

  // Shared state for the nightly workflow scenarios.
  let jobs: Record<string, NightlyJob>;
  let mutationJob: string;
  const givenNightlyWorkflow = () => {
    jobs = nightlyJobs();
  };
  const hasJobRunning = (_ctx: unknown, command: string) => {
    mutationJob = jobRunning(jobs, command).name;
  };
  const reportFailsWithMutationJob = () => {
    const reportJob = jobs.report;
    expect(reportJob.needs).toContain(mutationJob);
    const failStep = reportJob.steps?.find((s) => s.run?.trim() === "exit 1");
    expect(failStep?.if).toContain(`needs.${mutationJob}.result == 'failure'`);
  };
  /** The run commands of the steps after `command` in its job, each with its `if`. */
  const stepsAfter = (command: string) => {
    const { job, at } = jobRunning(jobs, command);
    return job.steps!.slice(at + 1);
  };

  // Every package source file the coverage run measures, repo-relative.
  const packageSources = () =>
    walk(resolve(REPO_ROOT, "packages"), (name) => name.endsWith(".ts"))
      .map((file) => toPosix(file))
      .filter(measured);
  const nightlyStryker = () => {
    expect(nightlyStrykerConfig().testRunner).toBe("vitest");
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
    "When the nightly workflow runs, tutors shall run mutation testing and fail the nightly run if the mutation score is below the break threshold of 90 percent.",
    ({ RuleScenario }) => {
      RuleScenario("The nightly workflow runs mutation testing and its failure fails the night", ({ Given, Then, And }) => {
        Given("the nightly workflow", givenNightlyWorkflow);
        Then("it shall have a job that runs {string}", hasJobRunning);
        And("the job that reports the night shall fail when the mutation job fails", reportFailsWithMutationJob);
      });

      RuleScenario("Stryker breaks below 90 percent", ({ Given, Then, And }) => {
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

  Rule(
    "Tutors shall load the mutation test run with the same workspace aliases and setup files as the main test run, so every test file it lists can reach the modules it mutates.",
    ({ RuleScenario }) => {
      const mutationTest = () => mutationConfig.test!;
      const mutationConfiguration = () => {
        expect(mutationTest().include?.length).toBeGreaterThan(0);
      };

      RuleScenario("The mutation run resolves the workspace the way the main run does", ({ Given, Then, And }) => {
        Given("the repository's coverage configuration", configuration);
        And("the mutation test configuration", mutationConfiguration);
        Then("the mutation run shall resolve the same workspace aliases as the main run", () => {
          expect(mutationConfig.resolve?.alias).toEqual(vitestConfig.resolve?.alias);
        });
        And("the mutation run shall load the same setup files as the main run", () => {
          expect(mutationTest().setupFiles).toEqual(vitestConfig.test!.setupFiles);
        });
      });

      RuleScenario("Every library suite the mutation run lists is one the main run also collects", ({ Given, Then }) => {
        Given("the mutation test configuration", mutationConfiguration);
        Then("every test file pattern it lists shall fall under the main run's test files", () => {
          const mainIncludes = vitestConfig.test!.include!;
          for (const pattern of mutationTest().include!) {
            const example = pattern.replace("**/*", "example");
            expect(mainIncludes.some((g) => matchesGlob(example, g)), pattern).toBe(true);
          }
        });
      });
    }
  );

  Rule(
    "When the nightly workflow runs, tutors shall mutation-test every TypeScript source file under the packages source directories against the unit, BDD and contract suites.",
    ({ RuleScenario }) => {
      const nightlyTest = () => nightlyMutationConfig.test!;
      const collects = (_ctx: unknown, file: string) => {
        const included = nightlyTest().include!.some((g) => matchesGlob(file, g));
        const excluded = nightlyTest().exclude!.some((g) => matchesGlob(file, g));
        expect(included && !excluded, file).toBe(true);
      };
      const mutated = (_ctx: unknown, file: string) => {
        expect(strykerMutates(nightlyStrykerConfig().mutate, file), file).toBe(true);
      };

      RuleScenario("The nightly workflow runs the comprehensive mutation run and its failure fails the night", ({ Given, Then, And }) => {
        Given("the nightly workflow", givenNightlyWorkflow);
        Then("it shall have a job that runs {string}", hasJobRunning);
        And("the job that reports the night shall fail when the mutation job fails", reportFailsWithMutationJob);
      });

      RuleScenario("Every package source file the coverage run measures is mutated", ({ Given, Then, And }) => {
        Given("the nightly Stryker configuration", nightlyStryker);
        Then("every package source file the coverage run measures shall be mutated", () => {
          const sources = packageSources();
          expect(sources.length).toBeGreaterThan(100);
          const missed = sources.filter((file) => !strykerMutates(nightlyStrykerConfig().mutate, file));
          expect(missed).toEqual([]);
        });
        And("the scaffolder source file {string} shall be mutated", mutated);
        And("the course service {string} shall be mutated", mutated);
      });

      RuleScenario("The comprehensive run collects the unit, BDD and contract suites", ({ Given, Then, And }) => {
        Given("the nightly mutation test configuration", () => {
          expect(nightlyTest().include?.length).toBeGreaterThan(0);
        });
        Then("it shall collect the unit test {string}", collects);
        And("it shall collect the BDD steps {string}", collects);
        And("it shall collect the contract test {string}", collects);
        And("the nightly run shall resolve the same workspace aliases and setup files as the main run", () => {
          expect(nightlyMutationConfig.resolve?.alias).toEqual(vitestConfig.resolve?.alias);
          expect(nightlyTest().setupFiles).toEqual(vitestConfig.test!.setupFiles);
        });
      });
    }
  );

  // Shared by the nightly floor scenarios (Rules 0117 and 0119): the floors in force and the nightly report.
  const givenNightlyFloor = (_ctx: unknown, floor: number, file: string) => {
    mutationFloors = { staleMargin: recordedNightlyFloors().staleMargin, files: { [file]: floor } };
    report = {
      files: {
        [file]: {
          mutants: [
            ...Array.from({ length: floor }, () => ({ status: "Killed" })),
            ...Array.from({ length: 100 - floor }, () => ({ status: "Survived" }))
          ]
        }
      }
    };
  };
  const nightlyRun = (_ctx: unknown, killed: number, missed: number, file: string) => {
    report.files[file] = {
      mutants: [
        ...Array.from({ length: killed }, () => ({ status: "Killed" })),
        ...Array.from({ length: missed }, (_, i) => ({ status: i % 2 ? "Survived" : "NoCoverage" }))
      ]
    };
  };
  const nightlyFailures = () => failingFindings(mutationFloorFindings(report, mutationFloors), "warn");
  const checksFloorsWith = (command: string) =>
    stepsAfter(command).find((s) => s.run?.includes("pnpm check:mutation-floors"))?.run ?? "";

  Rule(
    "If a module's score in the nightly mutation run is below its nightly floor or the module has no nightly floor, then tutors shall fail the nightly run and name the module.",
    ({ RuleScenario }) => {
      const failsWith = (_ctx: unknown, finding: string) => {
        expect(nightlyFailures()).toContain(finding);
      };

      RuleScenario("The nightly job checks every module against the nightly floors", ({ Given, Then }) => {
        Given("the nightly workflow", givenNightlyWorkflow);
        Then("the job that runs {string} shall check {string} against {string}", (_ctx, command: string, reportFile: string, floorsFile: string) => {
          const check = checksFloorsWith(command);
          expect(check).toContain(reportFile);
          expect(check).toContain(`--floors ${floorsFile}`);
          expect(resolve(REPO_ROOT, floorsFile)).toBe(NIGHTLY_MUTATION_FLOORS_PATH);
          expect(nightlyStrykerConfig().jsonReporter.fileName).toBe(reportFile);
        });
      });

      RuleScenario("A module below its nightly floor fails the night", ({ Given, When, Then }) => {
        Given("a recorded nightly mutation floor of {number} percent for {string}", givenNightlyFloor);
        When("the nightly run kills {number} and misses {number} of the mutants in {string}", nightlyRun);
        Then("the nightly floor check shall fail with {string}", failsWith);
      });

      RuleScenario("A new library module without a nightly floor fails the night", ({ Given, When, Then }) => {
        Given("a recorded nightly mutation floor of {number} percent for {string}", givenNightlyFloor);
        When("the nightly run kills {number} and misses {number} of the mutants in {string}", nightlyRun);
        Then("the nightly floor check shall fail with {string}", failsWith);
      });

      // A new module is caught at run time as unfloored; this catches a floor left behind by a
      // renamed or deleted module, which the run would report as unmeasured.
      RuleScenario("Every nightly floor names a package source file the nightly run mutates", ({ Given, Then }) => {
        Given("the nightly Stryker configuration", nightlyStryker);
        Then("every recorded nightly mutation floor shall name a package source file it mutates", () => {
          const floored = Object.keys(recordedNightlyFloors().files);
          expect(floored.length).toBeGreaterThan(50);
          const sources = new Set(packageSources().filter((file) => strykerMutates(nightlyStrykerConfig().mutate, file)));
          expect(floored.filter((file) => !sources.has(file))).toEqual([]);
        });
      });
    }
  );

  Rule(
    "If the nightly mutation run leaves any tracked file changed, then tutors shall fail the nightly run.",
    ({ RuleScenario }) => {
      RuleScenario("The nightly job proves the tree is clean after mutating in place", ({ Given, Then }) => {
        Given("the nightly workflow", givenNightlyWorkflow);
        Then("the job that runs {string} shall run {string} after it, even when it fails", (_ctx, command: string, clean: string) => {
          const step = stepsAfter(command).find((s) => s.run?.trim() === clean);
          expect(step, `no step runs ${clean} after ${command}`).toBeDefined();
          expect(step!.if).toContain("always()");
        });
      });

      RuleScenario("Stryker rewrites only the files it mutates", ({ Given, Then, And }) => {
        Given("the nightly Stryker configuration", nightlyStryker);
        Then("it shall mutate the source files in place", () => {
          expect(nightlyStrykerConfig().inPlace).toBe(true);
        });
        And("it shall not add type-check suppressions to files it does not mutate", () => {
          expect(nightlyStrykerConfig().disableTypeChecks).toBe(false);
        });
      });
    }
  );

  Rule(
    "When a module's score in the nightly mutation run is 2 or more points above its nightly floor, tutors shall report the floor to raise in the nightly summary without failing the nightly run.",
    ({ RuleScenario }) => {
      RuleScenario("A module that rose past the margin is reported and the night passes", ({ Given, When, Then, And }) => {
        Given("a recorded nightly mutation floor of {number} percent for {string}", givenNightlyFloor);
        When("the nightly run kills {number} and misses {number} of the mutants in {string}", nightlyRun);
        Then("the nightly summary shall report {string}", (_ctx, finding: string) => {
          const findings = mutationFloorFindings(report, mutationFloors);
          expect(mutationSummary(report, findings, "Nightly mutation")).toContain(`- ${finding}`);
        });
        And("the nightly floor check shall pass", () => {
          expect(nightlyFailures()).toEqual([]);
        });
      });

      RuleScenario("The nightly job warns on stale floors and writes the step summary", ({ Given, Then }) => {
        Given("the nightly workflow", givenNightlyWorkflow);
        Then("the job that runs {string} shall check floors with {string} and {string}", (_ctx, command: string, stale: string, summary: string) => {
          const check = checksFloorsWith(command);
          expect(check).toContain(stale);
          expect(check).toContain(`${summary} "$GITHUB_STEP_SUMMARY"`);
        });
      });
    }
  );
});
