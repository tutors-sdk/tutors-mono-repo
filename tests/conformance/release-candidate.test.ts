import { describe, expect, it } from "vitest";
import { planCandidate, renderStep, runPlan, type CandidateInput, type Executor, type RunStep } from "../../scripts/release-candidate.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const input = (over: Partial<CandidateInput> = {}): CandidateInput => ({
  version: "16.3.0",
  packageVersion: "16.3.0",
  sha: SHA,
  tags: [],
  tagsAtCommit: [],
  repoDir: "/work/mono repo",
  ...over
});

function executor(over: Partial<Executor> = {}): Executor & { ran: RunStep[]; slept: number } {
  const state = {
    ran: [] as RunStep[],
    slept: 0,
    run(step: RunStep) {
      state.ran.push(step);
      return 0;
    },
    imageServed: () => true,
    sleep(ms: number) {
      state.slept += ms;
    },
    ...over
  };
  return state;
}

describe("pnpm release:candidate", () => {
  it("accepts a leading v and ignores rc tags of other versions and non-numeric suffixes", () => {
    const plan = planCandidate(input({ version: "v16.3.0", tags: ["v16.3.0-rc.9", "v16.3.1-rc.20", "v16.3.0-rc.x", "v16.3.0-rc.10"] }));
    expect(plan.candidate).toBe("16.3.0-rc.11");
  });

  it("reuses the highest rc tag of the version already on the commit", () => {
    const plan = planCandidate(input({ tags: ["v16.3.0-rc.1", "v16.3.0-rc.2"], tagsAtCommit: ["v16.2.9-rc.4", "v16.3.0-rc.1", "v16.3.0-rc.2"] }));
    expect(plan).toMatchObject({ candidate: "16.3.0-rc.2", reused: true });
    expect(plan.steps[0]).toMatchObject({ kind: "run", argv: ["git", "push", "origin", "refs/tags/v16.3.0-rc.2"] });
  });

  it("refuses a version that is not X.Y.Z", () => {
    expect(() => planCandidate(input({ version: "16.3" }))).toThrow(/not a release version/);
  });

  it("passes the arguments after -- to harness release", () => {
    const plan = planCandidate(input({ passthrough: ["--fast", "--open"] }));
    expect(plan.steps.at(-1)).toMatchObject({ argv: ["npx", "--yes", "github:tutors-sdk/tutors-release-harness", "release", "--candidate", "16.3.0-rc.1", "--baseline", "prod", "--monorepo", "/work/mono repo", "--fast", "--open"] });
  });

  it("renders each step as a line a person can paste, quoting what the shell would split", () => {
    const [tag] = planCandidate(input()).steps;
    expect(renderStep(tag)).toBe(`(cd '/work/mono repo' && git tag v16.3.0-rc.1 ${SHA})`);
  });

  it("stops at the first failing command and runs nothing after it", () => {
    const plan = planCandidate(input());
    const run = executor({ run: () => 128 });
    expect(runPlan(plan, { dryRun: false, executor: run, print: () => {} })).toBe(128);
  });

  it("polls the registry until it serves the image, then goes on", () => {
    let calls = 0;
    const run = executor({ imageServed: () => ++calls > 3 });
    const plan = planCandidate(input());
    expect(runPlan(plan, { dryRun: false, executor: run, print: () => {}, pollMs: 10, waitMs: 1000 })).toBe(0);
    expect(run.slept).toBe(30);
    expect(run.ran.at(-1)?.argv[0]).toBe("npx");
  });

  it("fails without running the harness when an image never appears", () => {
    const run = executor({ imageServed: () => false });
    const out: string[] = [];
    const plan = planCandidate(input());
    expect(runPlan(plan, { dryRun: false, executor: run, print: (line) => out.push(line), pollMs: 10, waitMs: 50 })).toBe(1);
    expect(run.ran.map((step) => step.argv[0])).toEqual(["git", "git"]);
    expect(out.at(-1)).toContain("quay.io/tutors-sdk/tutors-reader:16.3.0-rc.1 is not in the registry");
  });

  it("is wired as a root script", async () => {
    const pkg = (await import("../../package.json", { with: { type: "json" } })).default as { scripts: Record<string, string> };
    expect(pkg.scripts["release:candidate"]).toBe("tsx scripts/release-candidate.ts");
  });
});
