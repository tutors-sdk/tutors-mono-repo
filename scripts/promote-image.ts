/**
 * Decide, and carry out, the promotion of a release candidate's image to the
 * release it became. Called by .github/workflows/image-build.yml on a final tag.
 *
 *   node scripts/promote-image.ts plan  --app reader --ref refs/tags/v16.3.0 --sha <commit>
 *   node scripts/promote-image.ts apply --app reader --ref refs/tags/v16.3.0 --sha <commit> --rc 16.3.0-rc.2 --digest sha256:...
 *   pnpm promote:image plan --app reader --ref v16.2.2 --dry-run      # what would happen, changes nothing
 *
 * Why. The release harness judges the X.Y.Z-rc.N images. If the final tag
 * rebuilt X.Y.Z from source, what shipped would be a different image (a new
 * digest, a fresh `apt-get upgrade`) from what was judged. Promoting retags the
 * judged image by digest instead: the digest, its cosign signature and its SBOM
 * attestation (all attached by digest) carry over unchanged.
 *
 * When it promotes. Only when the candidate is provably the same source as the
 * final tag, and only for the four checks below, all of which must hold:
 *
 *   1. the registry has an X.Y.Z-rc.N tag for the app (the highest N is used)
 *   2. git tree of v<X.Y.Z-rc.N> equals git tree of the final commit. The commit
 *      may differ (a release branch merged to main has its own sha); the tree may not
 *   3. the image's org.opencontainers.image.revision label is the rc tag's commit
 *   4. the digest's cosign signature verifies, made by image-build.yml at
 *      refs/tags/v<X.Y.Z-rc.N> on that commit
 *
 * When it does not, the plan is `rebuild`: the workflow falls back to building
 * X.Y.Z from source, says so with a warning and a job summary line, and reports
 * `promoted=false`. With --require-promotion the fallback is a failure instead.
 *
 * Anything that is not a final vX.Y.Z tag push (a prerelease tag, a branch, a
 * backfill, a pull request) is plan `build`: nothing to decide, behaviour as before.
 *
 * The decision (`planImage`, `outcomeOf`, `applyPromotion`) is pure over the
 * injected git and registry; tests/conformance/promote-image.test.ts drives it
 * with fakes. Only Node built-ins are used so the workflow can run this file
 * directly with Node 24, without installing dependencies on a job that holds
 * registry credentials.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const out = (line: string): void => void process.stdout.write(`${line}\n`);
const err = (line: string): void => void process.stderr.write(`${line}\n`);

export const APPS = ["reader", "catalogue", "live", "time"] as const;
export const IMAGE_PREFIX = "quay.io/tutors-sdk/tutors-";
export const REPOSITORY = "tutors-sdk/tutors-mono-repo";
export const COSIGN_ISSUER = "https://token.actions.githubusercontent.com";
/** The signer of every image, at any ref; what the release harness and deploy pins accept. */
export const COSIGN_IDENTITY_REGEXP = "^https://github.com/tutors-sdk/tutors-mono-repo/\\.github/workflows/image-build\\.yml@";

/** The sentence the job summary carries for an image that shipped without being judged. */
export const REBUILT_NOTICE = "REBUILT — this image is not the one the release harness judged";

export type RefKind = { kind: "final"; version: string } | { kind: "prerelease"; version: string } | { kind: "other" };

/** `refs/tags/v16.3.0` is final; `refs/tags/v16.3.0-rc.1` is a prerelease; everything else is neither. */
export function classifyRef(ref: string): RefKind {
  const tag = /^refs\/tags\/v(\d+\.\d+\.\d+)(-.+)?$/.exec(ref);
  if (!tag) return { kind: "other" };
  return tag[2] ? { kind: "prerelease", version: `${tag[1]}${tag[2]}` } : { kind: "final", version: tag[1] };
}

/** The candidate to promote: the highest `X.Y.Z-rc.N` among a repository's tags, or undefined. */
export function pickCandidate(tags: readonly string[], version: string): string | undefined {
  const prefix = `${version}-rc.`;
  let best: { tag: string; n: number } | undefined;
  for (const tag of tags) {
    if (!tag.startsWith(prefix)) continue;
    const n = tag.slice(prefix.length);
    if (!/^(0|[1-9]\d*)$/.test(n)) continue;
    if (!best || Number(n) > best.n) best = { tag, n: Number(n) };
  }
  return best?.tag;
}

/** The tags a release carries, all to be one digest: X.Y.Z, X.Y, latest and sha-<short>. */
export function tagSet(version: string, commit: string): string[] {
  const [major, minor] = version.split(".");
  return [version, `${major}.${minor}`, "latest", `sha-${commit.slice(0, 7)}`];
}

/** What the plan reads from git. `tree` and `commit` throw when the ref cannot be found. */
export interface GitReader {
  commit(ref: string): string;
  tree(ref: string): string;
}

/** What the plan reads from the registry. */
export interface RegistryReader {
  listTags(image: string): string[];
  digestOf(reference: string): string;
  /** `org.opencontainers.image.revision`, or undefined when the image has none. */
  revisionOf(reference: string): string | undefined;
  /** Why the signature does not verify, or undefined when it does. */
  verifySignature(reference: string, identity: string, commit: string): string | undefined;
}

export interface PlanInput {
  app: string;
  /** The git ref that started the run, e.g. refs/tags/v16.3.0. */
  ref: string;
  /** The commit of that ref. */
  sha: string;
  /** A backfill dispatch (release_tag set): publishes what production already runs, never promotes. */
  backfill?: boolean;
}

export type Plan =
  | { action: "build"; app: string; reason: string }
  | { action: "rebuild"; app: string; image: string; version: string; reason: string }
  | {
      action: "promote";
      app: string;
      image: string;
      version: string;
      rcVersion: string;
      rcCommit: string;
      digest: string;
      tags: string[];
    };

export function planImage(input: PlanInput, git: GitReader, registry: RegistryReader): Plan {
  const { app } = input;
  if (input.backfill) return { action: "build", app, reason: "backfill: publishes what production already runs" };
  const ref = classifyRef(input.ref);
  if (ref.kind !== "final") return { action: "build", app, reason: `${input.ref} is not a final release tag` };

  const version = ref.version;
  const image = `${IMAGE_PREFIX}${app}`;
  const rebuild = (reason: string): Plan => ({ action: "rebuild", app, image, version, reason });

  try {
    const rcVersion = pickCandidate(registry.listTags(image), version);
    if (!rcVersion) return rebuild(`no ${version}-rc.N tag in ${image}`);

    const rcRef = `refs/tags/v${rcVersion}`;
    const rcCommit = git.commit(rcRef);
    const rcTree = git.tree(rcRef);
    const finalTree = git.tree(input.sha);
    if (rcTree !== finalTree) {
      return rebuild(`v${rcVersion} (tree ${rcTree.slice(0, 12)}) is not the same source as v${version} (tree ${finalTree.slice(0, 12)})`);
    }

    const digest = registry.digestOf(`${image}:${rcVersion}`);
    const revision = registry.revisionOf(`${image}@${digest}`);
    if (revision !== rcCommit) {
      return rebuild(`${image}:${rcVersion} carries revision ${revision ?? "(none)"}, but v${rcVersion} is ${rcCommit}`);
    }
    const unsigned = registry.verifySignature(`${image}@${digest}`, identityAt(rcRef), rcCommit);
    if (unsigned) return rebuild(`${image}:${rcVersion} is not signed by image-build.yml at ${rcRef}: ${unsigned}`);

    return { action: "promote", app, image, version, rcVersion, rcCommit, digest, tags: tagSet(version, input.sha) };
  } catch (error) {
    return rebuild(`could not check the candidate: ${(error as Error).message.split("\n")[0]}`);
  }
}

/** The certificate identity of image-build.yml running at `ref`. */
export function identityAt(ref: string): string {
  return `https://github.com/${REPOSITORY}/.github/workflows/image-build.yml@${ref}`;
}

export interface Outcome {
  /** The value of the `promoted` step output. */
  promoted: boolean;
  /** Set when the run must stop. */
  failure?: string;
  /** Workflow command annotations, one per line, to print as they are. */
  annotations: string[];
  /** Markdown lines for the job summary. */
  summary: string[];
}

/** What the workflow does with a plan: the annotations, the summary, and whether to fail. */
export function outcomeOf(plan: Plan, requirePromotion: boolean): Outcome {
  switch (plan.action) {
    case "build":
      return { promoted: false, annotations: [], summary: [] };
    case "promote":
      return {
        promoted: true,
        annotations: [`::notice title=Promoted ${plan.app}::${plan.image}:${plan.version} is ${plan.rcVersion} (${plan.digest}), the image the release harness judged.`],
        summary: [`**${plan.app}: PROMOTED** \`${plan.image}:${plan.version}\` is the judged \`${plan.rcVersion}\` image, \`${plan.digest}\`. Not rebuilt.`]
      };
    case "rebuild": {
      if (requirePromotion) {
        const failure = `${plan.app}: cannot promote (${plan.reason}) and require_promotion is set, so nothing was built or pushed.`;
        return { promoted: false, failure, annotations: [`::error title=Promotion required::${failure}`], summary: [`**${plan.app}: NOT PUBLISHED** ${failure}`] };
      }
      return {
        promoted: false,
        annotations: [`::warning title=${REBUILT_NOTICE}::${plan.app}: ${plan.reason}. ${plan.image}:${plan.version} will be built from source.`],
        summary: [`**${plan.app}: ${REBUILT_NOTICE}.** ${plan.reason}.`]
      };
    }
  }
}

/** The decision and the command it leads to, worded as a forecast for a dry run and as a fact otherwise. */
export function describePlan(plan: Plan, dryRun = true): string[] {
  const would = dryRun ? "WOULD " : "";
  switch (plan.action) {
    case "build":
      return [`${plan.app}: BUILD as before (${plan.reason})`];
    case "rebuild":
      return [`${plan.app}: ${would}REBUILD ${plan.image}:${plan.version} from source (${plan.reason})`];
    case "promote":
      return [
        `${plan.app}: ${would}PROMOTE ${plan.image}:${plan.rcVersion} @ ${plan.digest}`,
        ...plan.tags.map((tag) => `  tag ${plan.image}:${tag}`),
        `  docker buildx imagetools create ${plan.tags.map((tag) => `-t ${plan.image}:${tag}`).join(" ")} ${plan.image}@${plan.digest}`
      ];
  }
}

/** What apply writes to and reads from the registry. */
export interface Publisher {
  /** Point every tag at the digest, without building. */
  retag(image: string, digest: string, tags: readonly string[]): void;
  digestOf(reference: string): string;
  /** Why the tag's signature does not verify against image-build.yml (any ref), or undefined. */
  verifySignature(reference: string): string | undefined;
  /** Why the tag has no SPDX SBOM attestation from image-build.yml, or undefined. */
  verifyAttestation(reference: string): string | undefined;
}

/**
 * Retag the judged digest, then prove it. X.Y.Z and sha-<short> go first and are
 * checked before X.Y and latest move, so a surprise stops the run while `latest`
 * still names the previous release. Returns the problems; empty means every tag
 * resolves to the digest and the promoted tag verifies.
 */
export function applyPromotion(plan: Extract<Plan, { action: "promote" }>, publisher: Publisher): string[] {
  const { image, digest, tags, version } = plan;
  const first = tags.filter((tag) => tag === version || tag.startsWith("sha-"));
  const rest = tags.filter((tag) => !first.includes(tag));
  const problems: string[] = [];
  const check = (tag: string) => {
    const resolved = publisher.digestOf(`${image}:${tag}`);
    if (resolved !== digest) problems.push(`${image}:${tag} resolves to ${resolved}, not ${digest}`);
  };

  publisher.retag(image, digest, first);
  first.forEach(check);
  const signature = publisher.verifySignature(`${image}:${version}`);
  if (signature) problems.push(`cosign verify ${image}:${version}: ${signature}`);
  const attestation = publisher.verifyAttestation(`${image}:${version}`);
  if (attestation) problems.push(`SBOM attestation of ${image}:${version}: ${attestation}`);
  if (problems.length > 0) return problems;

  publisher.retag(image, digest, rest);
  rest.forEach(check);
  return problems;
}

// ---------------------------------------------------------------------------
// The real git and registry. Kept thin: tests inject fakes instead.
// ---------------------------------------------------------------------------

function run(command: string, args: string[], options: { discardStdout?: boolean } = {}): string {
  try {
    // cosign prints the whole verified payload, a 4 MB SBOM for verify-attestation; a
    // caller that only wants the exit status must not buffer it (execFileSync would fail
    // with ENOBUFS at 1 MB and a good signature would read as a bad one).
    const stdio: ["ignore", "pipe" | "ignore", "pipe"] = ["ignore", options.discardStdout ? "ignore" : "pipe", "pipe"];
    return (execFileSync(command, args, { encoding: "utf8", stdio, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }) ?? "").trim();
  } catch (error) {
    const lines = String((error as { stderr?: unknown }).stderr ?? "")
      .trim()
      .split("\n");
    throw new Error(`${command} ${args[0] ?? ""}: ${lines[lines.length - 1] || (error as Error).message.split("\n")[0]}`, { cause: error });
  }
}

/** A tag ref that is not in the checkout yet (a shallow clone has none) is fetched from origin, once. */
function revParse(spec: string, peel: "commit" | "tree"): string {
  const parse = () => run("git", ["rev-parse", "--verify", "--quiet", `${spec}^{${peel}}`]);
  try {
    return parse();
  } catch (first) {
    if (!spec.startsWith("refs/tags/")) throw new Error(`${spec} is not in this checkout`, { cause: first });
  }
  run("git", ["fetch", "--no-tags", "--depth=1", "origin", `+${spec}:${spec}`]);
  return parse();
}

export const realGit: GitReader = {
  commit: (ref) => revParse(ref, "commit"),
  tree: (ref) => revParse(ref, "tree")
};

/**
 * Every tag of a repository, by the registry's v2 API (public repositories answer
 * anonymously). Pages are followed with `last=` until one comes back empty, because
 * a registry may return fewer tags than `n` asks for.
 */
function listTags(image: string): string[] {
  const host = image.slice(0, image.indexOf("/"));
  const name = image.slice(host.length + 1);
  const tags: string[] = [];
  let last = "";
  for (let page = 0; page < 200; page += 1) {
    const url = `https://${host}/v2/${name}/tags/list?n=1000${last ? `&last=${encodeURIComponent(last)}` : ""}`;
    const body = run("curl", ["--silent", "--show-error", "--fail", "--location", url]);
    const batch = (JSON.parse(body || "{}") as { tags?: string[] | null }).tags ?? [];
    if (batch.length === 0) break;
    tags.push(...batch);
    last = batch[batch.length - 1];
  }
  return tags;
}

function inspect(reference: string, format: string): string {
  return run("docker", ["buildx", "imagetools", "inspect", reference, "--format", format]);
}

export const realRegistry: RegistryReader = {
  listTags,
  digestOf: (reference) => inspect(reference, "{{.Manifest.Digest}}"),
  revisionOf: (reference) => {
    const doc = JSON.parse(inspect(reference, "{{json .}}")) as { image?: Record<string, { config?: { Labels?: Record<string, string> } }> };
    for (const platform of Object.values(doc.image ?? {})) {
      const revision = platform.config?.Labels?.["org.opencontainers.image.revision"];
      if (revision) return revision;
    }
    return undefined;
  },
  verifySignature: (reference, identity, commit) => cosign(["verify", "--certificate-identity", identity, "--certificate-github-workflow-sha", commit, ...issuer(), reference])
};

function issuer(): string[] {
  return ["--certificate-oidc-issuer", COSIGN_ISSUER];
}

/** Runs cosign; returns its first line of complaint on failure, undefined on success. */
function cosign(args: string[]): string | undefined {
  try {
    run("cosign", args, { discardStdout: true });
    return undefined;
  } catch (error) {
    return (error as Error).message.split("\n")[0];
  }
}

export const realPublisher: Publisher = {
  retag: (image, digest, tags) => {
    if (tags.length === 0) return;
    run("docker", ["buildx", "imagetools", "create", ...tags.flatMap((tag) => ["--tag", `${image}:${tag}`]), `${image}@${digest}`]);
  },
  digestOf: realRegistry.digestOf,
  verifySignature: (reference) => cosign(["verify", "--certificate-identity-regexp", COSIGN_IDENTITY_REGEXP, ...issuer(), reference]),
  verifyAttestation: (reference) => cosign(["verify-attestation", "--type", "spdxjson", "--certificate-identity-regexp", COSIGN_IDENTITY_REGEXP, ...issuer(), reference])
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
}

/** `v16.2.2` and `refs/tags/v16.2.2` both name a tag; a dry run from a shell types the short form. */
function fullRef(ref: string): string {
  return ref.startsWith("refs/") ? ref : `refs/tags/${ref}`;
}

function emit(file: string | undefined, lines: string[]): void {
  if (file && lines.length > 0) appendFileSync(file, `${lines.join("\n")}\n`);
}

function main(argv: string[]): number {
  const [command, ...args] = argv;
  const app = flag(args, "app");
  const refArg = flag(args, "ref");
  if ((command !== "plan" && command !== "apply") || !app || !(APPS as readonly string[]).includes(app) || !refArg) {
    err(`usage: promote-image.ts plan|apply --app <${APPS.join("|")}> --ref <git ref> [--sha <commit>] [--backfill] [--require-promotion] [--dry-run]`);
    err("       apply also needs --rc <X.Y.Z-rc.N> and --digest <sha256:...> from the plan's outputs");
    return 2;
  }
  const ref = fullRef(refArg);
  const dryRun = args.includes("--dry-run");
  const output = dryRun ? undefined : process.env.GITHUB_OUTPUT;
  const summary = dryRun ? undefined : process.env.GITHUB_STEP_SUMMARY;

  let sha = flag(args, "sha");
  if (!sha) sha = realGit.commit(ref);
  const plan = planImage({ app, ref, sha, backfill: args.includes("--backfill") }, realGit, realRegistry);

  if (command === "plan") {
    const outcome = outcomeOf(plan, args.includes("--require-promotion"));
    if (dryRun) {
      for (const line of describePlan(plan)) out(line);
      if (plan.action === "rebuild") out(`  with --require-promotion this would FAIL: ${outcomeOf(plan, true).failure}`);
      return 0;
    }
    for (const line of outcome.annotations) out(line);
    for (const line of describePlan(plan, false)) out(line);
    emit(output, [
      `promoted=${outcome.promoted}`,
      ...(plan.action === "promote" ? [`rc=${plan.rcVersion}`, `digest=${plan.digest}`, `tags=${plan.tags.join(" ")}`, `image=${plan.image}`] : [])
    ]);
    emit(summary, outcome.summary);
    return outcome.failure ? 1 : 0;
  }

  // apply: re-derive the plan from the same inputs and act on it only if it still promotes
  // the digest the scan looked at.
  if (plan.action !== "promote" || plan.digest !== flag(args, "digest") || plan.rcVersion !== flag(args, "rc")) {
    err(`::error::${app}: the promotion no longer holds (the plan step promoted ${flag(args, "rc")} @ ${flag(args, "digest")}, now: ${describePlan(plan)[0]}). Nothing was retagged.`);
    return 1;
  }
  if (dryRun) {
    for (const line of describePlan(plan)) out(line);
    return 0;
  }
  const problems = applyPromotion(plan, realPublisher);
  for (const problem of problems) err(`::error::${problem}`);
  emit(summary, [
    problems.length > 0
      ? `**${app}: promotion failed after retagging** ${problems.join("; ")}`
      : `**${app}: ${plan.tags.map((tag) => `\`${tag}\``).join(", ")} all resolve to \`${plan.digest}\`;** cosign signature and SBOM attestation verified on \`${plan.version}\`.`
  ]);
  return problems.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
