import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  deployedFindings,
  deployedRecord,
  overlayPinFindings,
  readDeployed,
  readOverlays,
  type DeployedRecord,
  type Pin
} from "../../../../scripts/checks/deploy-pins.ts";
import { REPO_ROOT } from "../../../../scripts/checks/lib/repo.ts";
import {
  CandidateRefused,
  planCandidate,
  renderStep,
  runPlan,
  type CandidatePlan,
  type Executor,
  type Step
} from "../../../../scripts/release-candidate.ts";

const feature = await loadFeature("tests/bdd/features/developer/release-candidate.feature");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO = "/work/tutors-mono-repo";
const APPS = ["reader", "catalogue", "live", "time"] as const;
const digestOf = (app: string, n: number) => `sha256:${String(APPS.indexOf(app as (typeof APPS)[number]) + n).repeat(64)}`;
const pinsAt = (tag: string, n = 1): Pin[] => APPS.map((app) => ({ app, image: `quay.io/tutors-sdk/tutors-${app}`, tag, digest: digestOf(app, n) }));

describeFeature(feature, ({ Rule }) => {
  let packageVersion = "";
  let tags: string[] = [];
  let tagsAtCommit: string[] = [];
  let harnessDir: string | undefined;
  let plan: CandidatePlan | undefined;
  let refused: Error | undefined;
  let printed: string[] = [];
  let ran: Step[] = [];
  let pins: Pin[] = [];
  let record: DeployedRecord | undefined;
  let findings: string[] = [];

  const reset = () => {
    packageVersion = "";
    tags = [];
    tagsAtCommit = [];
    harnessDir = undefined;
    plan = undefined;
    refused = undefined;
    printed = [];
    ran = [];
  };
  const givenPackage = (_ctx: unknown, version: string) => {
    reset();
    packageVersion = version;
  };
  const givenTags = (_ctx: unknown, list: string) => {
    tags = list.split(",").map((tag) => tag.trim());
  };
  const ask = (_ctx: unknown, version: string) => {
    try {
      plan = planCandidate({ version, packageVersion, sha: SHA, tags, tagsAtCommit, repoDir: REPO, harnessDir });
    } catch (error) {
      if (!(error instanceof CandidateRefused)) throw error;
      refused = error;
    }
  };
  const thenCandidate = (_ctx: unknown, candidate: string) => {
    expect(refused).toBeUndefined();
    expect(plan?.candidate).toBe(candidate);
  };
  const commands = () => plan!.steps.filter((step): step is Extract<Step, { kind: "run" }> => step.kind === "run");
  const harnessStep = () => {
    const last = plan!.steps.at(-1)!;
    expect(last.kind).toBe("run");
    return last as Extract<Step, { kind: "run" }>;
  };
  const recordingExecutor = (): Executor => ({
    run: (step) => {
      ran.push(step);
      return 0;
    },
    imageServed: () => true,
    sleep: () => {}
  });

  Rule("When a release captain asks for a release candidate of a version, tutors shall tag the captain's commit with the next release candidate number that version has not used.", ({ RuleScenario }) => {
    RuleScenario("The next free release candidate number is taken", ({ Given, And, When, Then }) => {
      Given("package.json is at {string}", givenPackage);
      And("the tags {string} exist", givenTags);
      When("the captain asks for a release candidate of {string}", ask);
      Then("the candidate shall be {string}", thenCandidate);
      And("the plan shall tag the commit {string} and push that tag to origin", (_ctx, tag: string) => {
        const argvs = commands().map((step) => step.argv.join(" "));
        expect(argvs).toContain(`git tag ${tag} ${SHA}`);
        expect(argvs).toContain(`git push origin refs/tags/${tag}`);
        expect(argvs.indexOf(`git tag ${tag} ${SHA}`)).toBeLessThan(argvs.indexOf(`git push origin refs/tags/${tag}`));
      });
    });
    RuleScenario("The first release candidate of a version is rc.1", ({ Given, And, When, Then }) => {
      Given("package.json is at {string}", givenPackage);
      And("the tags {string} exist", givenTags);
      When("the captain asks for a release candidate of {string}", ask);
      Then("the candidate shall be {string}", thenCandidate);
    });
  });

  Rule("If the captain's commit already carries a release candidate tag of the version, then tutors shall reuse that tag and create no new tag.", ({ RuleScenario }) => {
    RuleScenario("A commit that is already a candidate is not tagged twice", ({ Given, And, When, Then }) => {
      Given("package.json is at {string}", givenPackage);
      And("the tags {string} exist", givenTags);
      And("the commit carries the tag {string}", (_ctx, tag: string) => {
        tagsAtCommit = [tag];
      });
      When("the captain asks for a release candidate of {string}", ask);
      Then("the candidate shall be {string}", thenCandidate);
      And("the plan shall create no tag", () => {
        expect(plan!.reused).toBe(true);
        expect(commands().some((step) => step.argv[0] === "git" && step.argv[1] === "tag")).toBe(false);
      });
    });
  });

  Rule("If package.json does not carry the requested version or that version is already tagged as a release, then tutors shall refuse the release candidate and plan no command.", ({ RuleScenario }) => {
    const thenRefused = (_ctx: unknown, reason: string) => {
      expect(plan).toBeUndefined();
      expect(refused?.message).toContain(reason);
    };
    RuleScenario("A version package.json does not carry is refused", ({ Given, And, When, Then }) => {
      Given("package.json is at {string}", givenPackage);
      And("the tags {string} exist", givenTags);
      When("the captain asks for a release candidate of {string}", ask);
      Then("the release candidate shall be refused with {string}", thenRefused);
    });
    RuleScenario("A version already released is refused", ({ Given, And, When, Then }) => {
      Given("package.json is at {string}", givenPackage);
      And("the tags {string} exist", givenTags);
      When("the captain asks for a release candidate of {string}", ask);
      Then("the release candidate shall be refused with {string}", thenRefused);
    });
  });

  Rule("When a release candidate is tagged, tutors shall run the release harness against production only after the registry serves the candidate's reader, catalogue, live and time images.", ({ RuleScenario }) => {
    RuleScenario("The harness runs after all four images are published", ({ Given, And, When, Then }) => {
      Given("package.json is at {string}", givenPackage);
      And("the tags {string} exist", givenTags);
      When("the captain asks for a release candidate of {string}", ask);
      Then("the plan shall wait for {string} after pushing the tag", (_ctx, list: string) => {
        const images = list.split(",").map((image) => image.trim());
        const push = plan!.steps.findIndex((step) => step.kind === "run" && step.argv[1] === "push");
        const waits = plan!.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.kind === "wait-image");
        expect(waits.map(({ step }) => (step as Extract<Step, { kind: "wait-image" }>).image)).toEqual(images);
        for (const { index } of waits) expect(index).toBeGreaterThan(push);
        expect(Math.max(...waits.map(({ index }) => index))).toBeLessThan(plan!.steps.length - 1);
      });
      And("the last step of the plan shall run the harness with {string}", (_ctx, args: string) => {
        const line = harnessStep().argv.join(" ");
        expect(line).toContain(`${args} ${REPO}`);
      });
    });
  });

  Rule("Where HARNESS_DIR names a harness checkout, tutors shall run the release harness from that checkout instead of the published harness package.", ({ RuleScenario }) => {
    RuleScenario("A local harness checkout is used", ({ Given, And, When, Then }) => {
      Given("package.json is at {string}", givenPackage);
      And("HARNESS_DIR is {string}", (_ctx, dir: string) => {
        harnessDir = dir;
      });
      When("the captain asks for a release candidate of {string}", ask);
      Then("the harness shall run as {string} in {string}", (_ctx, command: string, dir: string) => {
        const step = harnessStep();
        expect(step.argv.join(" ").startsWith(`${command} `)).toBe(true);
        expect(step.cwd).toBe(dir);
      });
    });
    RuleScenario("Without HARNESS_DIR the published harness package is used", ({ Given, When, Then }) => {
      Given("package.json is at {string}", givenPackage);
      When("the captain asks for a release candidate of {string}", ask);
      Then("the harness shall run as {string} in the monorepo checkout", (_ctx, command: string) => {
        const step = harnessStep();
        expect(step.argv.join(" ").startsWith(`${command} `)).toBe(true);
        expect(step.cwd).toBe(REPO);
      });
    });
  });

  Rule("Where the captain asks for a dry run, tutors shall print every command of the release candidate and run none of them.", ({ RuleScenario }) => {
    RuleScenario("A dry run prints the plan and runs nothing", ({ Given, And, When, Then }) => {
      let executed = 0;
      Given("package.json is at {string}", givenPackage);
      And("the tags {string} exist", givenTags);
      When("the captain asks for a dry run of a release candidate of {string}", (ctx, version: string) => {
        ask(ctx, version);
        const executor: Executor = {
          run: () => {
            executed += 1;
            return 0;
          },
          imageServed: () => {
            executed += 1;
            return true;
          },
          sleep: () => {}
        };
        expect(runPlan(plan!, { dryRun: true, executor, print: (line) => printed.push(line) })).toBe(0);
      });
      Then("every command of the plan shall be printed", () => {
        const out = printed.join("\n");
        for (const step of plan!.steps) expect(out).toContain(renderStep(step));
      });
      And("no command shall be run", () => {
        expect(executed).toBe(0);
      });
    });
    RuleScenario("Without a dry run every command is run in order", ({ Given, And, When, Then }) => {
      Given("package.json is at {string}", givenPackage);
      And("the tags {string} exist", givenTags);
      When("the captain asks for a release candidate of {string} and every command succeeds", (ctx, version: string) => {
        ask(ctx, version);
        expect(runPlan(plan!, { dryRun: false, executor: recordingExecutor(), print: (line) => printed.push(line) })).toBe(0);
      });
      Then("every command of the plan shall be run in order", () => {
        expect(ran).toEqual(commands());
      });
    });
  });

  Rule("When production is pinned to a release, tutors shall record the release's tag, commit, pin time and four image digests in release/deployed.json.", ({ RuleScenario }) => {
    RuleScenario("Pinning production writes the deployed record", ({ Given, When, Then, And }) => {
      let tag = "";
      let commit = "";
      let at = "";
      Given("production is pinned to {string} at commit {string} at {string}", (_ctx, t: string, c: string, a: string) => {
        tag = t;
        commit = c;
        at = a;
        pins = pinsAt(tag);
      });
      When("the deployed record is written", () => {
        record = deployedRecord({ pins, commit, deployedAt: new Date(at) });
      });
      Then("release/deployed.json shall name tag {string}, commit {string} and deployedAt {string}", (_ctx, t: string, c: string, a: string) => {
        expect(record).toMatchObject({ tag: t, commit: c, deployedAt: a });
      });
      And("release/deployed.json shall carry the digests of reader, catalogue, live and time", () => {
        expect(record!.digests).toEqual(Object.fromEntries(pins.map((pin) => [pin.app, pin.digest])));
        expect(Object.keys(record!.digests!)).toEqual(["reader", "catalogue", "live", "time"]);
      });
    });
  });

  Rule("If release/deployed.json does not name the tag and digests the deploy overlays pin, then tutors shall fail the deploy pin check.", ({ RuleScenario }) => {
    const check = () => {
      findings = deployedFindings(pins, record);
    };
    RuleScenario("A deployed record that lags the overlays fails the check", ({ Given, And, When, Then }) => {
      Given("the overlays are pinned to {string}", (_ctx, tag: string) => {
        pins = pinsAt(tag, 2);
      });
      And("release/deployed.json names {string}", (_ctx, tag: string) => {
        record = deployedRecord({ pins: pinsAt(tag, 1), commit: SHA, deployedAt: new Date("2026-09-21T08:40:05Z") });
      });
      When("the deploy pins are checked", check);
      Then("the check shall report {string}", (_ctx, code: string) => {
        expect(findings.some((finding) => finding.startsWith(`${code}:`))).toBe(true);
      });
    });
    RuleScenario("The committed deployed record agrees with the committed overlays", ({ Given, When, Then }) => {
      Given("the committed overlays and release/deployed.json", () => {
        pins = overlayPinFindings(readOverlays()).pins;
        record = readDeployed(REPO_ROOT);
      });
      When("the deploy pins are checked", check);
      Then("the check shall report nothing", () => {
        expect(findings).toEqual([]);
      });
    });
  });
});
