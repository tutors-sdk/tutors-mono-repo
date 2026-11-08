import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { afterAll, expect } from "vitest";

const feature = await loadFeature("tests/bdd/features/instructor/course-validate-action.feature");

interface Step {
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
}
const action = yaml.load(readFileSync(".github/actions/tutors-validate/action.yml", "utf-8")) as {
  inputs: Record<string, { default: string }>;
  runs: { steps: Step[] };
};
const steps = action.runs.steps;
const validateStep = steps.find((step) => step.id === "validate")!;
const verdictStep = steps[steps.length - 1];
const uploadStep = steps.find((step) => step.uses?.startsWith("github/codeql-action/upload-sarif"))!;

/** Runs a step's script as GitHub does (bash -e -o pipefail), with a stand-in deno that logs its arguments. */
function runScript(script: string, env: Record<string, string>, work: string) {
  const output = join(work, "github-output");
  writeFileSync(output, "");
  const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
    env: { PATH: `${work}:${process.env.PATH}`, GITHUB_OUTPUT: output, ...env },
    encoding: "utf-8"
  });
  const outputs = Object.fromEntries(
    readFileSync(output, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(/=(.*)/s, 2))
  );
  return { status: result.status, stdout: result.stdout, outputs };
}

describeFeature(feature, ({ Rule }) => {
  const temps: string[] = [];
  afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  let work: string;
  let validateOutputs: Record<string, string>;
  let jobStatus: number | null;

  const stubDeno = (_ctx: unknown, status: number) => {
    work = mkdtempSync(join(tmpdir(), "tutors-action-"));
    temps.push(work);
    const deno = join(work, "deno");
    writeFileSync(deno, `#!/usr/bin/env bash\necho "$*" >> "${join(work, "calls")}"\nfor a in "$@"; do [ "$a" = sarif ] && echo '{"version":"2.1.0"}'; done\nexit ${status}\n`);
    chmodSync(deno, 0o755);
  };
  const runAction = (inputs: { path?: string; strict?: string; version?: string }) => {
    const env = {
      COURSE_PATH: inputs.path ?? action.inputs.path.default,
      STRICT: inputs.strict ?? action.inputs.strict.default,
      CREATE_VERSION: inputs.version ?? action.inputs.version.default,
      SARIF_FILE: join(work, "tutors-validate.sarif")
    };
    validateOutputs = runScript(validateStep.run!, env, work).outputs;
    jobStatus = runScript(verdictStep.run!, { EXIT_CODE: validateOutputs["exit-code"] }, work).status;
  };
  const runOn = (_ctx: unknown, path: string, strict: string) => runAction({ path, strict });
  const calls = () => (existsSync(join(work, "calls")) ? readFileSync(join(work, "calls"), "utf-8").trim().split("\n") : []);
  const ranThen = (_ctx: unknown, command: string, extra: string) => {
    const [module, ...rest] = command.split(" ");
    expect(calls()).toEqual([
      `run -A ${module} ${rest.join(" ")}`,
      `run -A ${module} ${rest.slice(0, 2).join(" ")} ${extra}${rest.length > 2 ? ` ${rest.slice(2).join(" ")}` : ""}`
    ]);
  };
  const failsWith = (_ctx: unknown, status: number) => expect(jobStatus).toBe(status);
  /** The upload step's condition, evaluated for an always() run with upload-sarif left at its default. */
  const uploads = () => uploadStep.if!.includes("steps.validate.outputs.sarif == 'true'") && validateOutputs.sarif === "true" && action.inputs["upload-sarif"].default === "true";

  Rule(
    "When the tutors validate action runs on a course, tutors shall print the findings to the job log, write them as SARIF for code scanning, and fail the job with tutors validate's exit status.",
    ({ RuleScenario }) => {
      RuleScenario("A course with errors fails the job and its findings are uploaded", ({ Given, When, Then, And }) => {
        Given("tutors validate will exit {int}", stubDeno);
        When("the action runs on {string} with strict {string}", runOn);
        Then("deno shall have run {string} and then the same with {string}", ranThen);
        And("the action shall upload the SARIF file", () => {
          expect(uploads()).toBe(true);
          expect(readFileSync(join(work, "tutors-validate.sarif"), "utf-8")).toContain('"version":"2.1.0"');
        });
        And("the job shall fail with status {int}", failsWith);
      });
      RuleScenario("Strict checking is passed on", ({ Given, When, Then, And }) => {
        Given("tutors validate will exit {int}", stubDeno);
        When("the action runs on {string} with strict {string}", runOn);
        Then("deno shall have run {string} and then the same with {string}", ranThen);
        And("the job shall fail with status {int}", failsWith);
      });
      RuleScenario("A clean course passes", ({ Given, When, Then }) => {
        Given("tutors validate will exit {int}", stubDeno);
        When("the action runs on {string} with strict {string}", runOn);
        Then("the job shall pass", () => expect(jobStatus).toBe(0));
      });
      RuleScenario("A folder that cannot be read uploads nothing", ({ Given, When, Then, And }) => {
        Given("tutors validate will exit {int}", stubDeno);
        When("the action runs on {string} with strict {string}", runOn);
        Then("the action shall not upload a SARIF file", () => {
          expect(uploads()).toBe(false);
          expect(calls()).toHaveLength(1);
        });
        And("the job shall fail with status {int}", failsWith);
      });
      RuleScenario("A version that is not a version never reaches deno", ({ Given, When, Then, And }) => {
        Given("tutors validate will exit {int}", stubDeno);
        When("the action runs with version {string}", (_ctx, version: string) => runAction({ version }));
        Then("deno shall not have run", () => expect(calls()).toEqual([]));
        And("the job shall fail with status {int}", failsWith);
      });
      RuleScenario("Every step it uses is pinned and every input reaches a script through the environment", ({ Given, Then, And }) => {
        Given("the action's definition", () => expect(steps.length).toBeGreaterThan(0));
        Then("each action it uses shall be pinned to a full commit SHA", () => {
          for (const step of steps.filter((s) => s.uses)) expect(step.uses).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
        });
        And("no run script shall interpolate an expression", () => {
          for (const step of steps.filter((s) => s.run)) expect(step.run).not.toContain("${{");
        });
      });
    }
  );
});
