/**
 * Build, from a local checkout and with nothing but git, the payload that
 * .github/workflows/release-dispatch.yml sends the release harness
 * (tutors-sdk/tutors-release-harness), and optionally run the harness with it.
 * The release flow does not need GitHub: this is the local trigger.
 *
 *   pnpm release:harness                       # the same as --print
 *   pnpm release:harness --print               # the release-candidate dispatch, as JSON on stdout
 *   pnpm release:harness --run                 # run the harness's `local gate` with those values
 *   pnpm release:harness --deployed --print    # the post-deploy `deployed` dispatch
 *   pnpm release:harness --deployed --run      # `local watch --once`, with HARNESS_PRODUCTION_TAG set
 *   pnpm release:harness --nightly --run       # `local nightly` against the production tag
 *   pnpm release:harness --run -- --only release --dry-run   # anything after `--` goes to the harness
 *
 * Where each value comes from (the workflow reads the same things through `gh api`):
 *
 *   production    images[0].newTag of deploy/k8s/overlays/reader/kustomization.yaml on main
 *                 (origin/main, else main; --main-ref names another ref). Never the release
 *                 branch: there the overlay already names the candidate.
 *   migrations_a  v<production> when that tag exists, else release/<production> when that branch does
 *   candidate     --candidate, else the rc tag already on the ref's commit, else the next free
 *                 X.Y.Z-rc.N (X.Y.Z is package.json at the ref, which must match a release/X.Y.Z
 *                 branch name). This script never creates a tag: the harness builds a candidate
 *                 the registry lacks from its tag, so push the tag before a real gate.
 *   migrations_b  the ref's commit sha
 *   claims_url    the raw URL of release/claims.yaml at that sha (--run passes the file itself,
 *                 read from that sha)
 *   runs          5 (--runs)
 *
 * Optional fields, sent only when there is something to send: production_digests (from the
 * overlays' `digest` of reader, catalogue, live and time, once they carry one), candidate_digests (--candidate-digest app=sha256:...),
 * rules_url (--rules-url). A local gate takes the rules from --rules <file>.
 *
 * Nothing here talks to a network or to GitHub, and nothing is tagged, pushed or dispatched.
 * Tags and branches are read from the local clone: `git fetch origin --tags` first when it may be behind.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import yaml from "js-yaml";
import { validateClaimsText } from "./checks/release-claims.ts";
import { REPO_ROOT } from "./checks/lib/repo.ts";

/** Apps whose overlays pin an image; the harness stacks these four (the `time` app since contract 1.3.0). */
export const APPS = ["reader", "catalogue", "live", "time"] as const;
type App = (typeof APPS)[number];

/** Same expression release-dispatch.yml checks the production tag against. */
export const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$/;
const RELEASE_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const OVERLAY = (app: string): string => `deploy/k8s/overlays/${app}/kustomization.yaml`;
const CLAIMS_FILE = "release/claims.yaml";
/**
 * Journey repetitions per side. Three can never reach alpha 0.05 on timing (four is the least that can), so the
 * harness default moved 3 -> 5 in contract 1.3.0. release-dispatch.yml sends the same number; the conformance test
 * in tests/conformance/release-harness.test.ts holds the two together.
 */
export const DEFAULT_RUNS = 5;
export const DEFAULT_REPOSITORY = "tutors-sdk/tutors-mono-repo";

type Env = Record<string, string | undefined>;

export type Digests = Record<App, string>;

export interface ClientPayload {
  production: string;
  candidate: string;
  claims_url: string;
  runs: number;
  migrations_a: string;
  migrations_b: string;
  production_digests?: Digests;
  candidate_digests?: Partial<Digests>;
  rules_url?: string;
}

export interface Dispatch<T> {
  event_type: string;
  client_payload: T;
}

/** A problem the person running this can fix; reported as `FAIL: ...` without a stack. */
export class ReleaseHarnessError extends Error {}

/** A mistake in the arguments, exit 2 (as the harness does); an empty message prints just the usage. */
export class UsageError extends Error {}

// ---- git -------------------------------------------------------------------------------------------

/** stdout of `git <args>` in `repo`, trimmed; undefined when git exits non-zero. */
export function git(repo: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch {
    return undefined;
  }
}

function refExists(repo: string, ref: string): boolean {
  return git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== undefined;
}

/** File content at a ref, exactly as committed; undefined when the ref or the file is missing. */
function showFile(repo: string, ref: string, path: string): string | undefined {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}

function shaOf(repo: string, ref: string): string {
  const sha = git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  if (!sha) throw new ReleaseHarnessError(`${ref} is not a commit in this checkout. Fetch it first (git fetch origin).`);
  return sha;
}

/** The ref production is read from: what GitHub calls main. `origin/main` is preferred, then a local `main`. */
export function resolveMainRef(repo: string, requested?: string): string {
  if (requested) {
    shaOf(repo, requested);
    return requested;
  }
  for (const candidate of ["refs/remotes/origin/main", "refs/heads/main"]) if (refExists(repo, candidate)) return candidate;
  throw new ReleaseHarnessError("Neither origin/main nor main exists here, so the production tag cannot be read. Run `git fetch origin main`, or name a ref with --main-ref.");
}

// ---- production, from the overlays -------------------------------------------------------------------

export interface OverlayPin {
  tag?: string;
  digest?: string;
}

/** `images[0].newTag` and `images[0].digest` of one app's overlay at a ref. Undefined fields are absent, not errors. */
export function readOverlayPin(repo: string, ref: string, app: string): OverlayPin | undefined {
  const text = showFile(repo, ref, OVERLAY(app));
  if (text === undefined) return undefined;
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (error) {
    throw new ReleaseHarnessError(`${OVERLAY(app)} at ${ref} is not valid YAML: ${(error as Error).message.split("\n")[0]}`);
  }
  const image = (doc as { images?: Array<{ newTag?: unknown; digest?: unknown }> } | null)?.images?.[0];
  return {
    ...(typeof image?.newTag === "string" ? { tag: image.newTag } : {}),
    ...(typeof image?.digest === "string" ? { digest: image.digest } : {})
  };
}

export interface Production {
  /** The deployed version, from the reader overlay. */
  tag: string;
  /** The digests of the four apps, only when every overlay pins one. */
  digests?: Digests;
  notes: string[];
}

export function readProduction(repo: string, mainRef: string, override?: string): Production {
  const notes: string[] = [];
  const reader = readOverlayPin(repo, mainRef, "reader");
  const tag = override ?? reader?.tag ?? "";
  if (!VERSION_PATTERN.test(tag)) {
    throw new ReleaseHarnessError(`Could not read images[].newTag from ${OVERLAY("reader")} on ${mainRef} (got '${tag}'). Pass --production <tag> to name it.`);
  }

  const found: Partial<Digests> = {};
  const missing: string[] = [];
  for (const app of APPS) {
    const pin = readOverlayPin(repo, mainRef, app);
    if (pin?.digest !== undefined && DIGEST.test(pin.digest)) found[app] = pin.digest;
    else missing.push(app);
  }
  if (override !== undefined && override !== reader?.tag) {
    notes.push(`--production ${override} differs from the overlay on ${mainRef} (${reader?.tag ?? "none"}); production digests are left out.`);
    return { tag, notes };
  }
  if (missing.length === 0) return { tag, digests: found as Digests, notes };
  if (missing.length === APPS.length) notes.push(`The overlays on ${mainRef} carry no digest yet; production_digests is left out.`);
  else notes.push(`No valid digest for ${missing.join(", ")} on ${mainRef}; production_digests is left out.`);
  return { tag, notes };
}

/** Production's migrations come from its tag; a release before tagging was routine only has its retained branch. */
export function resolveMigrationsA(repo: string, production: string): string {
  if (refExists(repo, `refs/tags/v${production}`)) return `v${production}`;
  for (const candidate of [`refs/heads/release/${production}`, `refs/remotes/origin/release/${production}`]) {
    if (refExists(repo, candidate)) return `release/${production}`;
  }
  throw new ReleaseHarnessError(
    `Production is ${production} but neither tag v${production} nor branch release/${production} exists in this checkout. Run \`git fetch origin --tags\` and try again.`
  );
}

// ---- the candidate ------------------------------------------------------------------------------------

export interface CandidateOptions {
  /** A bare candidate tag, `16.3.0-rc.1`. */
  candidate?: string;
  /** The ref to judge; HEAD when neither this nor `candidate` is given. */
  ref?: string;
}

export interface Candidate {
  tag: string;
  sha: string;
  ref: string;
  notes: string[];
}

/** `release/16.3.0` and `release/v16.3.0` (also as origin/... or refs/heads/...) name a version; other refs do not. */
export function branchVersion(ref: string): string | undefined {
  return /^(?:refs\/heads\/|refs\/remotes\/origin\/|origin\/)?release\/v?(\d+\.\d+\.\d+)$/.exec(ref)?.[1];
}

export function resolveCandidate(repo: string, options: CandidateOptions = {}): Candidate {
  const notes: string[] = [];
  let tag = options.candidate?.replace(/^v/, "");
  if (tag !== undefined && !VERSION_PATTERN.test(tag)) {
    throw new ReleaseHarnessError(`--candidate must be a bare version tag such as 16.3.0-rc.1 (got '${options.candidate}').`);
  }

  let ref = options.ref;
  if (ref === undefined) {
    if (tag !== undefined && refExists(repo, `refs/tags/v${tag}`)) ref = `refs/tags/v${tag}`;
    else ref = "HEAD";
  }
  const sha = shaOf(repo, ref);

  if (tag === undefined) {
    const named = branchVersion(ref) ?? (ref === "HEAD" ? branchVersion(git(repo, ["symbolic-ref", "--short", "-q", "HEAD"]) ?? "") : undefined);
    const pkgText = showFile(repo, sha, "package.json");
    if (pkgText === undefined) throw new ReleaseHarnessError(`package.json is missing at ${ref}.`);
    const pkg = (JSON.parse(pkgText) as { version?: string }).version ?? "";
    if (!RELEASE_VERSION.test(pkg)) throw new ReleaseHarnessError(`package.json at ${ref} says '${pkg}', not a release version X.Y.Z.`);
    if (named !== undefined && named !== pkg) {
      throw new ReleaseHarnessError(`package.json is at ${pkg}, the branch says ${named}. Not a candidate until the version is bumped.`);
    }
    if (refExists(repo, `refs/tags/v${pkg}`)) {
      throw new ReleaseHarnessError(`v${pkg} is already tagged. A retained release branch must not move after its release ships; nothing to judge.`);
    }
    const escaped = pkg.replaceAll(".", "\\.");
    const onCommit = (git(repo, ["tag", "--points-at", sha]) ?? "")
      .split(/\r?\n/)
      .map((name) => new RegExp(`^v(${escaped}-rc\\.\\d+)$`).exec(name)?.[1])
      .filter((name): name is string => name !== undefined);
    if (onCommit.length > 0) {
      tag = onCommit[0];
      notes.push(`This commit is already tagged v${tag}; reusing it.`);
    } else {
      const last = (git(repo, ["tag", "--list", `v${pkg}-rc.*`]) ?? "")
        .split(/\r?\n/)
        .map((name) => new RegExp(`^v${escaped}-rc\\.(\\d+)$`).exec(name)?.[1])
        .filter((n): n is string => n !== undefined)
        .map(Number)
        .reduce((max, n) => Math.max(max, n), 0);
      tag = `${pkg}-rc.${last + 1}`;
      notes.push(`v${tag} does not exist yet: this is the next free rc number, and nothing was tagged. The harness builds a candidate the registry lacks from its tag, so push the tag before a real gate.`);
    }
  } else if (!refExists(repo, `refs/tags/v${tag}`)) {
    notes.push(`v${tag} is not a tag in this checkout; migrations_b is ${ref} (${sha.slice(0, 12)}).`);
  }
  return { tag, sha, ref, notes };
}

// ---- the payload ---------------------------------------------------------------------------------------

/** owner/repo for the raw claims URL: GITHUB_REPOSITORY, else the origin remote, else the canonical repository. */
export function repositorySlug(repo: string, env: Env = process.env): string {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  const origin = git(repo, ["config", "--get", "remote.origin.url"]) ?? "";
  return /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(origin)?.[1] ?? DEFAULT_REPOSITORY;
}

export interface ReleaseOptions extends CandidateOptions {
  /** Override the production tag instead of reading the overlay. */
  production?: string;
  mainRef?: string;
  runs?: number;
  claimsUrl?: string;
  rulesUrl?: string;
  candidateDigests?: Partial<Digests>;
  env?: Env;
}

export interface ReleaseDispatch {
  dispatch: Dispatch<ClientPayload>;
  /** release/claims.yaml at the candidate commit, for a local run. */
  claimsText: string;
  candidate: Candidate;
  notes: string[];
}

/** The `release-candidate` dispatch, key for key what release-dispatch.yml builds. */
export function buildReleaseDispatch(repo: string, options: ReleaseOptions = {}): ReleaseDispatch {
  const candidate = resolveCandidate(repo, options);
  const claimsText = showFile(repo, candidate.sha, CLAIMS_FILE);
  if (claimsText === undefined) {
    throw new ReleaseHarnessError(`${CLAIMS_FILE} is missing at ${candidate.ref}. A release carries one; \`claims: []\` means nothing observable should differ.`);
  }
  const problems = validateClaimsText(claimsText);
  if (problems.length > 0) {
    throw new ReleaseHarnessError(`${CLAIMS_FILE} is not a valid claims file (the harness would exit 2):\n  ${problems.join("\n  ")}`);
  }

  const mainRef = resolveMainRef(repo, options.mainRef);
  const production = readProduction(repo, mainRef, options.production);
  const migrationsA = resolveMigrationsA(repo, production.tag);

  const payload: ClientPayload = {
    production: production.tag,
    candidate: candidate.tag,
    claims_url: options.claimsUrl ?? `https://raw.githubusercontent.com/${repositorySlug(repo, options.env)}/${candidate.sha}/${CLAIMS_FILE}`,
    runs: options.runs ?? DEFAULT_RUNS,
    migrations_a: migrationsA,
    migrations_b: candidate.sha,
    ...(production.digests ? { production_digests: production.digests } : {}),
    ...(options.candidateDigests && Object.keys(options.candidateDigests).length > 0 ? { candidate_digests: sortDigests(options.candidateDigests) } : {}),
    ...(options.rulesUrl ? { rules_url: options.rulesUrl } : {})
  };
  return { dispatch: { event_type: "release-candidate", client_payload: payload }, claimsText, candidate, notes: [...candidate.notes, ...production.notes] };
}

function sortDigests(digests: Partial<Digests>): Partial<Digests> {
  const out: Partial<Digests> = {};
  for (const app of APPS) if (digests[app] !== undefined) out[app] = digests[app];
  return out;
}

export interface DeployedPayload {
  production: string;
  digests?: Digests;
}

/** The `deployed` dispatch deploy.yml sends after a deploy, from the overlays at `mainRef`. */
export function buildDeployedDispatch(repo: string, options: { mainRef?: string; production?: string } = {}): { dispatch: Dispatch<DeployedPayload>; notes: string[] } {
  const mainRef = resolveMainRef(repo, options.mainRef);
  const production = readProduction(repo, mainRef, options.production);
  return {
    dispatch: { event_type: "deployed", client_payload: { production: production.tag, ...(production.digests ? { digests: production.digests } : {}) } },
    notes: production.notes
  };
}

// ---- running the harness --------------------------------------------------------------------------------

export type Mode = "gate" | "deployed" | "nightly";

export interface HarnessInvocation {
  /** Arguments to `pnpm`, run in the harness checkout. */
  argv: string[];
  env: Record<string, string>;
}

/** The harness command that does what the dispatch would have made a workflow do. */
export function harnessInvocation(
  mode: Mode,
  values: { production: string; candidate?: string; claimsFile?: string; runs?: number; migrationsA?: string; migrationsB?: string; rulesFile?: string },
  passthrough: string[] = []
): HarnessInvocation {
  if (mode === "deployed") {
    return { argv: ["harness", "local", "watch", "--once", ...passthrough], env: { HARNESS_PRODUCTION_TAG: values.production } };
  }
  if (mode === "nightly") {
    return { argv: ["harness", "local", "nightly", "--tag", values.production, ...passthrough], env: { HARNESS_PRODUCTION_TAG: values.production } };
  }
  return {
    argv: [
      "harness", "local", "gate",
      "--a", values.production,
      "--b", values.candidate ?? "",
      ...(values.claimsFile ? ["--claims", values.claimsFile] : []),
      "--runs", String(values.runs ?? DEFAULT_RUNS),
      ...(values.migrationsA ? ["--migrations-a", values.migrationsA] : []),
      ...(values.migrationsB ? ["--migrations-b", values.migrationsB] : []),
      ...(values.rulesFile ? ["--rules", values.rulesFile] : []),
      ...passthrough
    ],
    env: { HARNESS_PRODUCTION_TAG: values.production }
  };
}

/** The harness checkout: HARNESS_DIR, else a sibling of this repository (or of its main worktree). */
export function harnessDirCandidates(repo: string, env: Env = process.env): string[] {
  if (env.HARNESS_DIR) return [resolve(env.HARNESS_DIR)];
  const found = [resolve(repo, "..", "tutors-release-harness")];
  const common = git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common) found.push(resolve(common, "..", "..", "tutors-release-harness"));
  return [...new Set(found)];
}

export function findHarnessDir(repo: string, env: Env = process.env): string {
  const candidates = harnessDirCandidates(repo, env);
  for (const dir of candidates) if (existsSync(join(dir, "package.json"))) return dir;
  throw new ReleaseHarnessError(
    [
      `The release harness is not checked out at ${candidates.join(" or ")}.`,
      "Clone https://github.com/tutors-sdk/tutors-release-harness beside this repository, or set HARNESS_DIR to your checkout, then run `pnpm install` in it",
      "(`pnpm harness doctor` there says what else this machine needs)."
    ].join("\n")
  );
}

function quote(arg: string): string {
  return /^[\w@%+=:,./\\-]+$/.test(arg) ? arg : `"${arg.replaceAll('"', '\\"')}"`;
}

function runHarness(dir: string, invocation: HarnessInvocation): number {
  if (!existsSync(join(dir, "node_modules"))) {
    throw new ReleaseHarnessError(`${dir} has no node_modules. Run \`pnpm install\` there first.`);
  }
  // pnpm is a .cmd shim on Windows, which node only spawns through a shell (one quoted command line, no args array).
  const windows = process.platform === "win32";
  const options = { cwd: dir, stdio: "inherit" as const, env: { ...process.env, ...invocation.env } };
  const result = windows
    ? spawnSync(["pnpm", ...invocation.argv.map(quote)].join(" "), { ...options, shell: true })
    : spawnSync("pnpm", invocation.argv, options);
  if (result.error) throw new ReleaseHarnessError(`Could not start pnpm in ${dir}: ${result.error.message}`);
  return result.status ?? 1;
}

// ---- command line --------------------------------------------------------------------------------------

const USAGE = `usage: pnpm release:harness [--print] [--run] [--deployed | --nightly] [options] [-- <harness args>]

  --print                  print the dispatch payload as JSON (the default when neither --print nor --run is given)
  --run                    run the harness: local gate (default), local watch --once (--deployed), local nightly (--nightly)
  --deployed               the post-deploy \`deployed\` dispatch (production and digests, from the overlays on main)
  --nightly                with --run: local nightly against the production tag

  --candidate <tag>        the candidate, 16.3.0-rc.1; default: the rc tag on --ref, else the next free rc number
  --ref <ref>              the commit to judge (default HEAD, or v<candidate> when that tag exists)
  --main-ref <ref>         where production is read from (default origin/main, else main)
  --production <tag>       use this production tag instead of the overlay's
  --runs <n>               A/B runs (default ${DEFAULT_RUNS})
  --claims-url <url>       claims_url in the payload (default: the raw URL at the candidate's sha)
  --rules-url <url>        rules_url in the payload (harness contract 1.3.0)
  --rules <file>           with --run: pass --rules <file> to the harness (contract 1.3.0)
  --candidate-digest <app=sha256:...>   candidate_digests entry, repeatable (harness contract 1.3.0)
  --repo <dir>             the monorepo checkout (default: this one)

HARNESS_DIR names the harness checkout (default ../tutors-release-harness). Arguments after -- go to the harness.`;

interface Parsed {
  mode: Mode;
  print: boolean;
  run: boolean;
  repo: string;
  release: ReleaseOptions;
  rulesFile?: string;
  passthrough: string[];
}

export function parseCli(argv: string[]): Parsed {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        print: { type: "boolean" },
        run: { type: "boolean" },
        deployed: { type: "boolean" },
        nightly: { type: "boolean" },
        candidate: { type: "string" },
        ref: { type: "string" },
        "main-ref": { type: "string" },
        production: { type: "string" },
        runs: { type: "string" },
        "claims-url": { type: "string" },
        "rules-url": { type: "string" },
        rules: { type: "string" },
        "candidate-digest": { type: "string", multiple: true },
        repo: { type: "string" },
        help: { type: "boolean", short: "h" }
      }
    });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) throw new UsageError("");
  if (values.deployed && values.nightly) throw new UsageError("--deployed and --nightly are different tasks; pick one.");
  if (values.nightly && !values.run) throw new UsageError("--nightly has no payload to print; use it with --run.");
  const mode: Mode = values.deployed ? "deployed" : values.nightly ? "nightly" : "gate";

  let runs: number | undefined;
  if (values.runs !== undefined) {
    runs = Number(values.runs);
    if (!Number.isInteger(runs) || runs < 1) throw new UsageError("--runs takes a whole number, 1 or more");
  }
  const candidateDigests: Partial<Digests> = {};
  for (const entry of values["candidate-digest"] ?? []) {
    const [app, digest] = entry.split("=");
    if (!(APPS as readonly string[]).includes(app) || !DIGEST.test(digest ?? "")) {
      throw new UsageError(`--candidate-digest takes <${APPS.join("|")}>=sha256:<64 hex>, got '${entry}'`);
    }
    candidateDigests[app as App] = digest;
  }
  const repo = values.repo ? resolve(values.repo) : REPO_ROOT;
  const rulesFile = values.rules ? (isAbsolute(values.rules) ? values.rules : resolve(values.rules)) : undefined;
  return {
    mode,
    print: values.print === true || values.run !== true,
    run: values.run === true,
    repo,
    rulesFile,
    passthrough: positionals,
    release: {
      candidate: values.candidate,
      ref: values.ref,
      mainRef: values["main-ref"],
      production: values.production,
      runs,
      claimsUrl: values["claims-url"],
      rulesUrl: values["rules-url"],
      candidateDigests
    }
  };
}

function out(text: string): void {
  process.stdout.write(`${text}\n`);
}

function err(text: string): void {
  process.stderr.write(`${text}\n`);
}

function main(): void {
  let parsed: Parsed;
  try {
    parsed = parseCli(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    err(error.message ? `${error.message}\n\n${USAGE}` : USAGE);
    process.exit(error.message ? 2 : 0);
  }

  let tempDir: string | undefined;
  try {
    const { mode, repo, release } = parsed;
    let invocation: HarnessInvocation;
    if (mode === "gate") {
      const built = buildReleaseDispatch(repo, release);
      for (const note of built.notes) err(`note: ${note}`);
      if (parsed.print) out(JSON.stringify(built.dispatch, null, 2));
      const p = built.dispatch.client_payload;
      if (parsed.run) {
        tempDir = mkdtempSync(join(tmpdir(), "release-harness-"));
        const claimsFile = join(tempDir, "claims.yaml");
        writeFileSync(claimsFile, built.claimsText);
        invocation = harnessInvocation(
          "gate",
          { production: p.production, candidate: p.candidate, claimsFile, runs: p.runs, migrationsA: p.migrations_a, migrationsB: p.migrations_b, rulesFile: parsed.rulesFile },
          parsed.passthrough
        );
      } else return;
    } else {
      const built = buildDeployedDispatch(repo, { mainRef: release.mainRef, production: release.production });
      for (const note of built.notes) err(`note: ${note}`);
      if (parsed.print) out(JSON.stringify(mode === "deployed" ? built.dispatch : { tag: built.dispatch.client_payload.production }, null, 2));
      if (!parsed.run) return;
      invocation = harnessInvocation(mode, { production: built.dispatch.client_payload.production }, parsed.passthrough);
    }
    const dir = findHarnessDir(repo);
    err(`running in ${dir}: pnpm ${invocation.argv.join(" ")}`);
    process.exitCode = runHarness(dir, invocation);
  } catch (error) {
    if (!(error instanceof ReleaseHarnessError)) throw error;
    err(`FAIL: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
