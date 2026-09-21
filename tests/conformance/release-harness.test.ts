import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { REPO_ROOT, readText } from "../../scripts/checks/lib/repo.ts";
import {
  APPS,
  DEFAULT_RUNS,
  ReleaseHarnessError,
  UsageError,
  VERSION_PATTERN,
  branchVersion,
  buildDeployedDispatch,
  buildReleaseDispatch,
  findHarnessDir,
  harnessInvocation,
  parseCli,
  readProduction,
  repositorySlug,
  resolveCandidate,
  resolveMigrationsA
} from "../../scripts/release-harness.ts";

const DIGEST = (n: number): string => `sha256:${String(n).repeat(64)}`;
const roots: string[] = [];

/** A throwaway git repository: every commit, tag and ref made here is on disk in a temp directory. */
class FakeRepo {
  readonly dir: string;

  constructor() {
    this.dir = mkdtempSync(join(tmpdir(), "release-harness-test-"));
    roots.push(this.dir);
    this.git("init", "-q", "-b", "main");
  }

  git(...args: string[]): string {
    return execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
      cwd: this.dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  }

  write(path: string, text: string): this {
    const full = join(this.dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
    return this;
  }

  commit(message = "commit"): string {
    this.git("add", "-A");
    this.git("commit", "-q", "--allow-empty", "-m", message);
    return this.git("rev-parse", "HEAD");
  }

  overlay(app: string, tag: string, digest?: string): this {
    return this.write(
      `deploy/k8s/overlays/${app}/kustomization.yaml`,
      [
        "images:",
        "  - name: tutors-app",
        `    newName: quay.io/tutors-sdk/tutors-${app}`,
        `    newTag: "${tag}"`,
        ...(digest ? [`    digest: ${digest}`] : []),
        ""
      ].join("\n")
    );
  }

  overlays(tag: string, digests?: Record<string, string>): this {
    for (const app of APPS) this.overlay(app, tag, digests?.[app]);
    return this;
  }

  pkg(version: string): this {
    return this.write("package.json", JSON.stringify({ name: "tutors", version }));
  }

  claims(text = "claims: []\n"): this {
    return this.write("release/claims.yaml", text);
  }
}

/**
 * A repository as it looks in the middle of a release: main (mirrored as origin/main) is at 16.2.2 and tagged,
 * and the checked-out release/16.3.0 has already moved its overlay and package.json to 16.3.0.
 */
function releaseCycle(options: { digests?: boolean; tagProduction?: boolean } = {}): { repo: FakeRepo; sha: string } {
  const repo = new FakeRepo();
  const digests = options.digests ? { reader: DIGEST(1), catalogue: DIGEST(2), live: DIGEST(3), time: DIGEST(4) } : undefined;
  repo.pkg("16.2.2").overlays("16.2.2", digests).claims();
  repo.commit("16.2.2");
  if (options.tagProduction !== false) repo.git("tag", "v16.2.2");
  repo.git("update-ref", "refs/remotes/origin/main", "HEAD");
  repo.git("remote", "add", "origin", "git@github.com:tutors-sdk/tutors-mono-repo.git");
  repo.git("checkout", "-q", "-b", "release/16.3.0");
  repo.pkg("16.3.0").overlays("16.3.0").claims("claims:\n  - artefact: dom\n    scope: 'reader:lab-step*'\n    reason: 'Rule 0031: lab steps show reading time'\n");
  const sha = repo.commit("16.3.0");
  return { repo, sha };
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

describe("release-harness: the release-candidate dispatch, from git alone", () => {
  let cycle: ReturnType<typeof releaseCycle>;
  beforeEach(() => {
    cycle = releaseCycle();
  });

  it("builds the payload release-dispatch.yml builds", () => {
    const { dispatch, notes } = buildReleaseDispatch(cycle.repo.dir);
    expect(dispatch).toEqual({
      event_type: "release-candidate",
      client_payload: {
        production: "16.2.2",
        candidate: "16.3.0-rc.1",
        claims_url: `https://raw.githubusercontent.com/tutors-sdk/tutors-mono-repo/${cycle.sha}/release/claims.yaml`,
        runs: 5,
        migrations_a: "v16.2.2",
        migrations_b: cycle.sha
      }
    });
    expect(Object.keys(dispatch.client_payload)).toEqual(["production", "candidate", "claims_url", "runs", "migrations_a", "migrations_b"]);
    expect(notes.join("\n")).toMatch(/no digest yet/);
    expect(notes.join("\n")).toMatch(/nothing was tagged/);
  });

  it("reads production from main, never from the release branch", () => {
    // HEAD's overlay says 16.3.0; a payload of production 16.3.0 would compare the candidate with itself.
    expect(readProduction(cycle.repo.dir, "refs/remotes/origin/main").tag).toBe("16.2.2");
    expect(buildReleaseDispatch(cycle.repo.dir).dispatch.client_payload.production).toBe("16.2.2");
  });

  it("falls back to a local main when there is no origin/main, and honours --main-ref", () => {
    cycle.repo.git("update-ref", "-d", "refs/remotes/origin/main");
    expect(buildReleaseDispatch(cycle.repo.dir).dispatch.client_payload.production).toBe("16.2.2");
    expect(buildReleaseDispatch(cycle.repo.dir, { mainRef: "release/16.3.0" }).dispatch.client_payload.production).toBe("16.3.0");
    cycle.repo.git("branch", "-m", "main", "trunk");
    expect(() => buildReleaseDispatch(cycle.repo.dir)).toThrow(/Neither origin\/main nor main/);
  });

  it("numbers the candidate: next free rc, or the rc already on the commit", () => {
    const first = cycle.repo.git("rev-parse", "HEAD");
    cycle.repo.git("tag", "v16.3.0-rc.1");
    expect(resolveCandidate(cycle.repo.dir).tag).toBe("16.3.0-rc.1");
    expect(resolveCandidate(cycle.repo.dir).notes[0]).toMatch(/already tagged v16\.3\.0-rc\.1/);

    cycle.repo.write("CHANGES", "more").commit("harden");
    cycle.repo.git("tag", "v16.3.0-rc.3");
    cycle.repo.write("CHANGES", "even more").commit("harden again");
    expect(resolveCandidate(cycle.repo.dir).tag).toBe("16.3.0-rc.4");
    expect(resolveCandidate(cycle.repo.dir, { ref: first }).tag).toBe("16.3.0-rc.1");
    // rc numbers of another version do not count
    cycle.repo.git("tag", "v16.4.0-rc.9");
    expect(resolveCandidate(cycle.repo.dir).tag).toBe("16.3.0-rc.4");
  });

  it("takes an explicit candidate, judging its tag's commit when it exists", () => {
    const tagged = cycle.repo.git("rev-parse", "HEAD");
    cycle.repo.git("tag", "v16.3.0-rc.2");
    cycle.repo.write("CHANGES", "later").commit("after the tag");
    const built = buildReleaseDispatch(cycle.repo.dir, { candidate: "16.3.0-rc.2" });
    expect(built.dispatch.client_payload.candidate).toBe("16.3.0-rc.2");
    expect(built.dispatch.client_payload.migrations_b).toBe(tagged);
    expect(buildReleaseDispatch(cycle.repo.dir, { candidate: "v16.3.0-rc.7" }).notes.join("\n")).toMatch(/v16\.3\.0-rc\.7 is not a tag/);
    expect(() => resolveCandidate(cycle.repo.dir, { candidate: "latest" })).toThrow(/bare version tag/);
  });

  it("is not a candidate until package.json carries the branch's version, or after the release shipped", () => {
    cycle.repo.pkg("16.2.2").commit("forgot the bump");
    expect(() => resolveCandidate(cycle.repo.dir)).toThrow(/package\.json is at 16\.2\.2, the branch says 16\.3\.0/);
    cycle.repo.pkg("16.3.0").commit("bumped");
    expect(resolveCandidate(cycle.repo.dir).tag).toBe("16.3.0-rc.1");
    cycle.repo.git("tag", "v16.3.0");
    expect(() => resolveCandidate(cycle.repo.dir)).toThrow(/v16\.3\.0 is already tagged/);
    expect(branchVersion("release/v16.3.0")).toBe("16.3.0");
    expect(branchVersion("origin/release/16.3.0")).toBe("16.3.0");
    expect(branchVersion("feat/x")).toBeUndefined();
  });

  it("finds production's migrations at its tag, else at its retained branch", () => {
    expect(resolveMigrationsA(cycle.repo.dir, "16.2.2")).toBe("v16.2.2");
    cycle.repo.git("tag", "-d", "v16.2.2");
    expect(() => resolveMigrationsA(cycle.repo.dir, "16.2.2")).toThrow(/neither tag v16\.2\.2 nor branch release\/16\.2\.2/);
    cycle.repo.git("branch", "release/16.2.2", "refs/remotes/origin/main");
    expect(resolveMigrationsA(cycle.repo.dir, "16.2.2")).toBe("release/16.2.2");
    cycle.repo.git("branch", "-D", "release/16.2.2");
    cycle.repo.git("update-ref", "refs/remotes/origin/release/16.2.2", "refs/remotes/origin/main");
    expect(resolveMigrationsA(cycle.repo.dir, "16.2.2")).toBe("release/16.2.2");
  });

  it("insists on a claims file the harness would accept", () => {
    cycle.repo.git("rm", "-q", "release/claims.yaml");
    cycle.repo.commit("no claims");
    expect(() => buildReleaseDispatch(cycle.repo.dir)).toThrow(/release\/claims\.yaml is missing/);
    cycle.repo.claims("claims:\n  - artefact: dom\n    scope: x\n    reason: approved\n").commit("bad claims");
    expect(() => buildReleaseDispatch(cycle.repo.dir)).toThrow(/rubber stamp/);
  });

  it("reads the claims at the candidate's commit, not the working tree", () => {
    cycle.repo.claims("claims: []\n").write("scratch", "dirty");
    const built = buildReleaseDispatch(cycle.repo.dir);
    expect(built.claimsText).toContain("Rule 0031");
  });

  it("refuses a production tag it cannot read", () => {
    expect(() => buildReleaseDispatch(cycle.repo.dir, { production: "main" })).toThrow(/Could not read images\[\]\.newTag/);
    expect(buildReleaseDispatch(cycle.repo.dir, { production: "16.2.2" }).dispatch.client_payload.production).toBe("16.2.2");
  });

  it("takes the claims URL and slug from the environment, the origin remote, or the canonical repository", () => {
    expect(repositorySlug(cycle.repo.dir, {})).toBe("tutors-sdk/tutors-mono-repo");
    cycle.repo.git("remote", "set-url", "origin", "https://github.com/someone/fork.git");
    expect(repositorySlug(cycle.repo.dir, {})).toBe("someone/fork");
    expect(repositorySlug(cycle.repo.dir, { GITHUB_REPOSITORY: "a/b" })).toBe("a/b");
    cycle.repo.git("remote", "set-url", "origin", "/some/local/path");
    expect(repositorySlug(cycle.repo.dir, {})).toBe("tutors-sdk/tutors-mono-repo");
    expect(buildReleaseDispatch(cycle.repo.dir, { claimsUrl: "https://example.test/c.yaml" }).dispatch.client_payload.claims_url).toBe("https://example.test/c.yaml");
  });
});

describe("release-harness: digests and the optional 1.3.0 fields", () => {
  it("adds production_digests once the overlays on main pin every app", () => {
    const { repo } = releaseCycle({ digests: true });
    const { dispatch } = buildReleaseDispatch(repo.dir);
    expect(dispatch.client_payload.production_digests).toEqual({ reader: DIGEST(1), catalogue: DIGEST(2), live: DIGEST(3), time: DIGEST(4) });
    expect(Object.keys(dispatch.client_payload).slice(-1)).toEqual(["production_digests"]);
  });

  it("leaves them out, without failing, when there is no digest yet or only some", () => {
    const { repo } = releaseCycle({ digests: true });
    repo.git("checkout", "-q", "main");
    repo.overlay("time", "16.2.2").commit("time loses its digest");
    repo.git("update-ref", "refs/remotes/origin/main", "HEAD");
    repo.git("checkout", "-q", "release/16.3.0");
    const built = buildReleaseDispatch(repo.dir);
    expect(built.dispatch.client_payload).not.toHaveProperty("production_digests");
    expect(built.notes.join("\n")).toMatch(/No valid digest for time/);
  });

  it("ignores a malformed digest and does not send digests for an overridden production tag", () => {
    const { repo } = releaseCycle({ digests: true });
    repo.git("checkout", "-q", "main");
    repo.overlay("reader", "16.2.2", "sha256:short").commit("bad digest");
    repo.git("update-ref", "refs/remotes/origin/main", "HEAD");
    repo.git("checkout", "-q", "release/16.3.0");
    expect(buildReleaseDispatch(repo.dir).dispatch.client_payload).not.toHaveProperty("production_digests");

    const other = releaseCycle({ digests: true });
    other.repo.git("tag", "v16.1.0", "refs/remotes/origin/main");
    const overridden = buildReleaseDispatch(other.repo.dir, { production: "16.1.0" });
    expect(overridden.dispatch.client_payload).not.toHaveProperty("production_digests");
    expect(overridden.dispatch.client_payload.migrations_a).toBe("v16.1.0");
  });

  it("sends candidate_digests and rules_url only when given", () => {
    const { repo } = releaseCycle();
    const built = buildReleaseDispatch(repo.dir, { candidateDigests: { live: DIGEST(9), reader: DIGEST(7) }, rulesUrl: "https://example.test/rules.json" });
    expect(built.dispatch.client_payload.candidate_digests).toEqual({ reader: DIGEST(7), live: DIGEST(9) });
    expect(Object.keys(built.dispatch.client_payload.candidate_digests ?? {})).toEqual(["reader", "live"]);
    expect(built.dispatch.client_payload.rules_url).toBe("https://example.test/rules.json");
    expect(buildReleaseDispatch(repo.dir).dispatch.client_payload).not.toHaveProperty("rules_url");
    expect(buildReleaseDispatch(repo.dir).dispatch.client_payload).not.toHaveProperty("candidate_digests");
  });
});

describe("release-harness: the deployed dispatch", () => {
  it("names production and, when the overlays pin them, the digests, as deploy.yml does", () => {
    const pinned = releaseCycle({ digests: true });
    expect(buildDeployedDispatch(pinned.repo.dir).dispatch).toEqual({
      event_type: "deployed",
      client_payload: { production: "16.2.2", digests: { reader: DIGEST(1), catalogue: DIGEST(2), live: DIGEST(3), time: DIGEST(4) } }
    });
    const unpinned = releaseCycle();
    const built = buildDeployedDispatch(unpinned.repo.dir);
    expect(built.dispatch).toEqual({ event_type: "deployed", client_payload: { production: "16.2.2" } });
    expect(built.notes.join("\n")).toMatch(/no digest yet/);
  });
});

describe("release-harness: running the harness", () => {
  it("maps the payload onto `harness local gate`", () => {
    const invocation = harnessInvocation("gate", {
      production: "16.2.2",
      candidate: "16.3.0-rc.1",
      claimsFile: "/tmp/claims.yaml",
      runs: 5,
      migrationsA: "v16.2.2",
      migrationsB: "abc123",
      rulesFile: "/tmp/rules.json"
    }, ["--only", "release"]);
    expect(invocation.argv).toEqual([
      "harness", "local", "gate", "--a", "16.2.2", "--b", "16.3.0-rc.1", "--claims", "/tmp/claims.yaml", "--runs", "5",
      "--migrations-a", "v16.2.2", "--migrations-b", "abc123", "--rules", "/tmp/rules.json", "--only", "release"
    ]);
    expect(invocation.env).toEqual({ HARNESS_PRODUCTION_TAG: "16.2.2" });
  });

  it("runs the post-deploy watch once with the production tag the deploy job would have set", () => {
    expect(harnessInvocation("deployed", { production: "16.2.2" })).toEqual({ argv: ["harness", "local", "watch", "--once"], env: { HARNESS_PRODUCTION_TAG: "16.2.2" } });
    expect(harnessInvocation("nightly", { production: "16.2.2" }).argv).toEqual(["harness", "local", "nightly", "--tag", "16.2.2"]);
  });

  it("says how to get the harness when it is not there", () => {
    const missing = join(tmpdir(), "no-such-harness-checkout");
    expect(() => findHarnessDir(REPO_ROOT, { HARNESS_DIR: missing })).toThrow(ReleaseHarnessError);
    expect(() => findHarnessDir(REPO_ROOT, { HARNESS_DIR: missing })).toThrow(/tutors-release-harness[\s\S]*HARNESS_DIR[\s\S]*pnpm install/);
    const here = new FakeRepo().write("package.json", "{}");
    expect(findHarnessDir(REPO_ROOT, { HARNESS_DIR: here.dir })).toBe(here.dir);
  });

  it("looks beside the repository by default", () => {
    const parent = mkdtempSync(join(tmpdir(), "release-harness-siblings-"));
    roots.push(parent);
    mkdirSync(join(parent, "tutors-release-harness"));
    writeFileSync(join(parent, "tutors-release-harness", "package.json"), "{}");
    mkdirSync(join(parent, "monorepo"));
    expect(findHarnessDir(join(parent, "monorepo"), {})).toBe(join(parent, "tutors-release-harness"));
  });
});

describe("release-harness: command line", () => {
  it("defaults to --print and forwards everything after `--` to the harness", () => {
    const parsed = parseCli(["--runs", "7", "--candidate-digest", `reader=${DIGEST(4)}`, "--", "--only", "release"]);
    expect(parsed).toMatchObject({ mode: "gate", print: true, run: false, passthrough: ["--only", "release"] });
    expect(parsed.release.runs).toBe(7);
    expect(parsed.release.candidateDigests).toEqual({ reader: DIGEST(4) });
    expect(parseCli(["--run"])).toMatchObject({ print: false, run: true });
    expect(parseCli(["--deployed", "--print", "--run"])).toMatchObject({ mode: "deployed", print: true, run: true });
  });

  it("rejects what the harness would", () => {
    expect(() => parseCli(["--runs", "0"])).toThrow(UsageError);
    expect(() => parseCli(["--candidate-digest", "reader=sha256:abc"])).toThrow(/sha256:<64 hex>/);
    expect(() => parseCli(["--deployed", "--nightly", "--run"])).toThrow(UsageError);
    expect(() => parseCli(["--nightly"])).toThrow(/--run/);
    expect(() => parseCli(["--frobnicate"])).toThrow(UsageError);
  });
});

/**
 * release-dispatch.yml builds its payload with `gh api` and jq, and cannot call the script: its checkout is shallow
 * and untagged, and the tag is made through the API. So the two are kept from drifting here instead. When this fails,
 * change the workflow and scripts/release-harness.ts together.
 */
describe("release-harness: parity with release-dispatch.yml", () => {
  const workflow = readText(join(REPO_ROOT, ".github/workflows/release-dispatch.yml"));
  const program = /'(\{event_type: "release-candidate"[\s\S]*?)' \\\r?\n\s+> payload\.json/.exec(workflow)?.[1] ?? "";
  // the fields always sent, then the ones sent only when there is something to send, each `(if $x then {key: $x} else {} end)`
  const required = [...(/client_payload: \(\{([^}]*)\}/.exec(program)?.[1] ?? "").matchAll(/(\w+): /g)].map((m) => m[1]);
  const optional = [...program.matchAll(/\(if \$\w+ [^{]*then \{(\w+): /g)].map((m) => m[1]);

  it("sends exactly the fields the script builds, in the same order, with the same defaults", () => {
    expect(program).not.toBe("");
    const { repo } = releaseCycle({ digests: true });
    const built = buildReleaseDispatch(repo.dir, { candidateDigests: { reader: DIGEST(5) }, rulesUrl: "https://example.test/rules.json" }).dispatch;
    expect(required).toEqual(["production", "candidate", "claims_url", "runs", "migrations_a", "migrations_b"]);
    expect(optional).toEqual(["production_digests", "candidate_digests", "rules_url"]);
    expect(Object.keys(built.client_payload)).toEqual([...required, ...optional]);
    expect(built.event_type).toBe("release-candidate");
  });

  it("holds the run count to the script's default, which is the harness's", () => {
    expect(DEFAULT_RUNS).toBe(5);
    expect(/runs: (\d+)/.exec(program)?.[1]).toBe(String(DEFAULT_RUNS));
    expect(buildReleaseDispatch(releaseCycle().repo.dir).dispatch.client_payload.runs).toBe(DEFAULT_RUNS);
  });

  it("reads the digests of the same four apps as the script, from the overlays and the registry", () => {
    const loops = [...workflow.matchAll(/for app in ([a-z ]+); do/g)].map((m) => m[1]);
    expect(loops).toHaveLength(3); // wait for the images, read the production digests, read the candidate digests
    for (const loop of loops) expect(loop).toBe(APPS.join(" "));
    expect(workflow).toContain("deploy/k8s/overlays/$app/kustomization.yaml?ref=main");
    expect(workflow).toContain("docker buildx imagetools inspect \"$image\" --format '{{.Manifest.Digest}}'");
  });

  it("sends the optional fields only when there is a value", () => {
    expect(program).toContain("$production_digests then");
    expect(program).toContain("$candidate_digests then");
    expect(program).toContain('$rules_url != "" then');
    // an unset output is an empty string, which --argjson would refuse: it must default to null
    expect(workflow).toContain('--argjson production_digests "${PRODUCTION_DIGESTS:-null}"');
    expect(workflow).toContain('--argjson candidate_digests "${CANDIDATE_DIGESTS:-null}"');
  });

  it("builds the claims URL, the migration refs and the production tag the way the workflow does", () => {
    expect(workflow).toContain('claims_url="https://raw.githubusercontent.com/$GITHUB_REPOSITORY/$GITHUB_SHA/release/claims.yaml"');
    expect(workflow).toContain("--arg migrations_b \"$GITHUB_SHA\"");
    // the workflow's version-format check is the script's
    const grep = /grep -Eq '(\^\[0-9\]\+[^']*)'/.exec(workflow.split("Read the production tag from main")[1] ?? "")?.[1];
    expect(grep).toBe(VERSION_PATTERN.source);
    // migrations_a: the tag first, then the retained branch
    const tag = workflow.indexOf('git/ref/tags/v$production');
    const branch = workflow.indexOf('git/ref/heads/release/$production');
    expect(tag).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(tag);
    expect(workflow).toContain('migrations_a="v$production"');
    expect(workflow).toContain('migrations_a="release/$production"');
    // production comes from the reader overlay on main
    expect(workflow).toContain("deploy/k8s/overlays/reader/kustomization.yaml?ref=main");
  });

  it("names the same rc tags and claims file", () => {
    expect(workflow).toContain('candidate="$VERSION-rc.$(( ${last:-0} + 1 ))"');
    expect(workflow).toContain("release/claims.yaml");
    const doc = yaml.load(workflow) as { on: { push: { branches: string[] } } };
    expect(doc.on.push.branches).toEqual(["release/**"]);
  });

  it("publishes rules.json for the pushed commit at a credential-free URL named for the rc tag", () => {
    expect(workflow).toContain('pnpm --silent release:rules --ref "$GITHUB_SHA" --out rules.json');
    expect(workflow).toContain('releases/download/$tag/rules.json');
    expect(workflow).toContain("--prerelease");
  });
});

describe("release-harness: parity with deploy.yml", () => {
  it("sends the digest of every app the script knows in `digests`", () => {
    const deploy = readText(join(REPO_ROOT, ".github/workflows/deploy.yml"));
    const object = /digests=\$\(jq -c '\{([^}]*)\}' pins\.json\)/.exec(deploy)?.[1] ?? "";
    expect([...object.matchAll(/(\w+): \.images\./g)].map((m) => m[1])).toEqual([...APPS]);
  });
});
