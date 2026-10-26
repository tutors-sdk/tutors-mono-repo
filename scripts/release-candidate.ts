/**
 * One command from a commit to a release harness report (release/SOP.md, step 1 and the handover to 2-7):
 *
 *   pnpm release:candidate 16.3.0              # tag v16.3.0-rc.N, publish its images, run the harness
 *   pnpm release:candidate 16.3.0 --dry-run    # print every command, run none of them
 *   pnpm release:candidate 16.3.0 -- --fast    # anything after `--` goes to `harness release`
 *
 * It does three things and nothing else:
 *
 *   1. tag     HEAD as vX.Y.Z-rc.N, N the next number no vX.Y.Z-rc.* tag uses (a commit that already
 *              carries one of those tags reuses it), and push the tag to origin
 *   2. images  the pushed tag starts image-build.yml, which builds, scans, signs and publishes
 *              quay.io/tutors-sdk/tutors-<app>:X.Y.Z-rc.N for the four apps (the same build
 *              release-dispatch.yml starts for a release branch push); this waits until the registry
 *              serves all four, anonymously, as the harness will pull them
 *   3. harness `harness release --candidate X.Y.Z-rc.N --baseline prod --monorepo <this checkout>`, from
 *              the checkout HARNESS_DIR names, else `npx github:tutors-sdk/tutors-release-harness`.
 *              The harness reads production from release/deployed.json in this checkout
 *
 * package.json must already carry X.Y.Z (the version bump of the release cut), and vX.Y.Z must not be
 * tagged yet. Tags are read from this clone after `git fetch origin --tags`; a dry run fetches nothing,
 * so fetch first when the clone may be behind. Needs git, docker (buildx) and, without HARNESS_DIR, npx.
 *
 * The plan (planCandidate) is pure and the runner (runPlan) takes its executor as an argument, so both
 * are tested without git, a registry or a harness: tests/bdd/features/developer/release-candidate.feature.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "./checks/lib/repo.ts";

export const APPS = ["reader", "catalogue", "live", "time"] as const;
export const IMAGE_PREFIX = "quay.io/tutors-sdk/tutors-";
export const HARNESS_PACKAGE = "github:tutors-sdk/tutors-release-harness";
/** image-build.yml builds linux/arm64 under QEMU; release-dispatch.yml gives the same build 75 minutes. */
export const IMAGE_WAIT_MS = 75 * 60 * 1000;
export const IMAGE_POLL_MS = 30 * 1000;

const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;

export type RunStep = { kind: "run"; argv: string[]; cwd: string; why: string };
export type WaitStep = { kind: "wait-image"; image: string; why: string };
export type Step = RunStep | WaitStep;

export interface CandidateInput {
  /** X.Y.Z, with or without a leading v. */
  version: string;
  /** The root package.json version at the commit. */
  packageVersion: string;
  /** The commit to tag: HEAD. */
  sha: string;
  /** Every tag in the clone. */
  tags: string[];
  /** The tags on `sha`. */
  tagsAtCommit: string[];
  /** This monorepo checkout: passed to the harness as --monorepo. */
  repoDir: string;
  /** HARNESS_DIR, when set. */
  harnessDir?: string;
  /** Arguments after `--`, for `harness release`. */
  passthrough?: string[];
  remote?: string;
}

export interface CandidatePlan {
  /** The bare candidate, 16.3.0-rc.3: the image tag and the harness's --candidate. */
  candidate: string;
  /** The git tag, v16.3.0-rc.3. */
  tag: string;
  /** True when the commit already carried the tag and nothing is tagged. */
  reused: boolean;
  steps: Step[];
}

/** A release candidate that must not be made; nothing is planned or run. */
export class CandidateRefused extends Error {}

export function planCandidate(input: CandidateInput): CandidatePlan {
  const version = input.version.replace(/^v/, "");
  const remote = input.remote ?? "origin";
  if (!RELEASE_VERSION.test(version)) throw new CandidateRefused(`'${input.version}' is not a release version X.Y.Z.`);
  if (input.packageVersion !== version) {
    throw new CandidateRefused(`package.json is at ${input.packageVersion}, not ${version}. Bump the version (the release cut) before tagging a candidate.`);
  }
  if (input.tags.includes(`v${version}`)) {
    throw new CandidateRefused(`v${version} is already tagged. A released version takes no more candidates; bump to the next version.`);
  }

  const rc = new RegExp(`^v${version.replaceAll(".", "\\.")}-rc\\.(\\d+)$`);
  const onCommit = input.tagsAtCommit
    .map((tag) => rc.exec(tag))
    .filter((match): match is RegExpExecArray => match !== null)
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const next = input.tags.map((tag) => rc.exec(tag)?.[1]).filter((n): n is string => n !== undefined).map(Number).reduce((max, n) => Math.max(max, n), 0) + 1;
  const reused = onCommit !== undefined;
  const candidate = reused ? onCommit[0].slice(1) : `${version}-rc.${next}`;
  const tag = `v${candidate}`;

  const steps: Step[] = [];
  if (!reused) steps.push({ kind: "run", argv: ["git", "tag", tag, input.sha], cwd: input.repoDir, why: `tag ${input.sha.slice(0, 12)} as the next free candidate` });
  // Pushing an existing tag again is a no-op, and it is the push that starts image-build.yml.
  steps.push({ kind: "run", argv: ["git", "push", remote, `refs/tags/${tag}`], cwd: input.repoDir, why: "the tag push starts image-build.yml, which publishes the four images" });
  for (const app of APPS) steps.push({ kind: "wait-image", image: `${IMAGE_PREFIX}${app}:${candidate}`, why: `wait until the registry serves ${app}` });

  const harnessArgs = ["release", "--candidate", candidate, "--baseline", "prod", "--monorepo", input.repoDir, ...(input.passthrough ?? [])];
  steps.push(
    input.harnessDir
      ? { kind: "run", argv: ["pnpm", "harness", ...harnessArgs], cwd: input.harnessDir, why: "run the release harness from HARNESS_DIR" }
      : { kind: "run", argv: ["npx", "--yes", HARNESS_PACKAGE, ...harnessArgs], cwd: input.repoDir, why: "run the published release harness (set HARNESS_DIR to use a checkout)" }
  );
  return { candidate, tag, reused, steps };
}

function quote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}

/** The step as one shell line a person could paste. */
export function renderStep(step: Step): string {
  if (step.kind === "wait-image") return `docker buildx imagetools inspect ${step.image}`;
  return `(cd ${quote(step.cwd)} && ${step.argv.map(quote).join(" ")})`;
}

export interface Executor {
  /** Run a command with its output shown; the exit status. */
  run(step: RunStep): number;
  /** True when the registry serves the image. */
  imageServed(image: string): boolean;
  sleep(ms: number): void;
}

export interface RunOptions {
  dryRun: boolean;
  executor: Executor;
  print: (line: string) => void;
  waitMs?: number;
  pollMs?: number;
}

/** Run the plan in order and stop at the first failure; the exit status of the first failing step, else 0. */
export function runPlan(plan: CandidatePlan, options: RunOptions): number {
  const { executor, print } = options;
  const waitMs = options.waitMs ?? IMAGE_WAIT_MS;
  const pollMs = options.pollMs ?? IMAGE_POLL_MS;
  print(`${options.dryRun ? "Would make" : "Making"} release candidate ${plan.candidate}${plan.reused ? ` (the commit is already ${plan.tag}; reusing it)` : ""}:`);
  for (const [index, step] of plan.steps.entries()) {
    const suffix = step.kind === "wait-image" ? `   # until it succeeds, every ${pollMs / 1000}s for up to ${waitMs / 60000} min` : "";
    print(`${index + 1}. ${renderStep(step)}${suffix}`);
    print(`   # ${step.why}`);
    if (options.dryRun) continue;
    if (step.kind === "run") {
      const status = executor.run(step);
      if (status !== 0) {
        print(`FAIL: step ${index + 1} exited ${status}; nothing after it was run.`);
        return status;
      }
      continue;
    }
    let waited = 0;
    while (!executor.imageServed(step.image)) {
      if (waited >= waitMs) {
        print(`FAIL: ${step.image} is not in the registry after ${waitMs / 60000} min. Check the image-build.yml run for ${plan.tag}.`);
        return 1;
      }
      executor.sleep(pollMs);
      waited += pollMs;
    }
  }
  if (options.dryRun) print("--dry-run: nothing was run.");
  return 0;
}

// ---- command line -------------------------------------------------------------------------------------

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

const lines = (text: string): string[] => text.split(/\r?\n/).filter((line) => line !== "");

const systemExecutor: Executor = {
  run(step) {
    const result = spawnSync(step.argv[0], step.argv.slice(1), { cwd: step.cwd, stdio: "inherit", shell: process.platform === "win32" });
    if (result.error) process.stderr.write(`Could not start ${step.argv[0]}: ${result.error.message}\n`);
    return result.status ?? 1;
  },
  imageServed(image) {
    return spawnSync("docker", ["buildx", "imagetools", "inspect", image], { stdio: "ignore" }).status === 0;
  },
  sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  }
};

const USAGE = "usage: pnpm release:candidate <X.Y.Z> [--dry-run] [-- <harness release args>]";

function main(): void {
  const args = process.argv.slice(2);
  const split = args.indexOf("--");
  const own = split < 0 ? args : args.slice(0, split);
  const passthrough = split < 0 ? [] : args.slice(split + 1);
  const dryRun = own.includes("--dry-run");
  const unknown = own.filter((arg) => arg.startsWith("-") && arg !== "--dry-run");
  const positionals = own.filter((arg) => !arg.startsWith("-"));
  if (own.includes("--help") || own.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (unknown.length > 0 || positionals.length !== 1) {
    process.stderr.write(`${unknown.length > 0 ? `unknown option ${unknown[0]}\n` : ""}${USAGE}\n`);
    process.exit(2);
  }

  if (dryRun) process.stderr.write("note: --dry-run reads tags from this clone without fetching; run git fetch origin --tags first if it may be behind.\n");
  else git(["fetch", "--quiet", "origin", "--tags"]);

  const sha = git(["rev-parse", "--verify", "HEAD^{commit}"]);
  let plan: CandidatePlan;
  try {
    plan = planCandidate({
      version: positionals[0],
      packageVersion: (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version,
      sha,
      tags: lines(git(["tag", "--list"])),
      tagsAtCommit: lines(git(["tag", "--points-at", sha])),
      repoDir: REPO_ROOT,
      harnessDir: process.env.HARNESS_DIR ? resolve(process.env.HARNESS_DIR) : undefined,
      passthrough
    });
  } catch (error) {
    if (!(error instanceof CandidateRefused)) throw error;
    process.stderr.write(`FAIL: ${error.message}\n`);
    process.exit(1);
  }
  process.exitCode = runPlan(plan, { dryRun, executor: systemExecutor, print: (line) => process.stdout.write(`${line}\n`) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
