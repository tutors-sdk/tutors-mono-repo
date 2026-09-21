import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import {
  REBUILT_NOTICE,
  applyPromotion,
  classifyRef,
  describePlan,
  identityAt,
  outcomeOf,
  pickCandidate,
  planImage,
  tagSet,
  type GitReader,
  type Plan,
  type Publisher,
  type RegistryReader
} from "../../scripts/promote-image.ts";

const IMAGE = "quay.io/tutors-sdk/tutors-reader";
const RC_COMMIT = "a".repeat(40);
const FINAL_COMMIT = "b".repeat(40);
const TREE = "1234567890abcdef1234567890abcdef12345678";
const DIGEST = `sha256:${"c".repeat(64)}`;

interface World {
  /** Tags in the registry repository. */
  tags: string[];
  /** ref -> commit, ref -> tree, for git. */
  commits: Record<string, string>;
  trees: Record<string, string>;
  /** Image tag -> digest. */
  digests: Record<string, string>;
  revision: string | undefined;
  signatureError: string | undefined;
  /** Every call made, so tests can prove what was (not) looked at. */
  calls: string[];
}

/** A registry and a git checkout in which the candidate 16.3.0-rc.2 is promotable. */
function world(overrides: Partial<World> = {}): World {
  return {
    tags: ["16.2.2", "16.3.0-rc.1", "16.3.0-rc.2", "main", "sha-abcdef0"],
    commits: { "refs/tags/v16.3.0-rc.1": "9".repeat(40), "refs/tags/v16.3.0-rc.2": RC_COMMIT },
    trees: { "refs/tags/v16.3.0-rc.1": "f".repeat(40), "refs/tags/v16.3.0-rc.2": TREE, [FINAL_COMMIT]: TREE },
    digests: { [`${IMAGE}:16.3.0-rc.2`]: DIGEST, [`${IMAGE}:16.3.0-rc.1`]: `sha256:${"d".repeat(64)}` },
    revision: RC_COMMIT,
    signatureError: undefined,
    calls: [],
    ...overrides
  };
}

function fakes(w: World): { git: GitReader; registry: RegistryReader } {
  const need = <T>(map: Record<string, T>, key: string, what: string): T => {
    if (!(key in map)) throw new Error(`${what} ${key} not found`);
    return map[key];
  };
  return {
    git: {
      commit: (ref) => (w.calls.push(`git commit ${ref}`), need(w.commits, ref, "ref")),
      tree: (ref) => (w.calls.push(`git tree ${ref}`), need(w.trees, ref, "ref"))
    },
    registry: {
      listTags: (image) => (w.calls.push(`list ${image}`), w.tags),
      digestOf: (reference) => (w.calls.push(`digest ${reference}`), need(w.digests, reference, "image")),
      revisionOf: (reference) => (w.calls.push(`revision ${reference}`), w.revision),
      verifySignature: (reference, identity, commit) => (w.calls.push(`verify ${reference} ${identity} ${commit}`), w.signatureError)
    }
  };
}

function plan(w: World, ref = "refs/tags/v16.3.0", extra: { backfill?: boolean } = {}): Plan {
  const { git, registry } = fakes(w);
  return planImage({ app: "reader", ref, sha: FINAL_COMMIT, ...extra }, git, registry);
}

describe("promote-image: choosing the release candidate", () => {
  it("classifies only vX.Y.Z tags as final", () => {
    expect(classifyRef("refs/tags/v16.3.0")).toEqual({ kind: "final", version: "16.3.0" });
    expect(classifyRef("refs/tags/v16.3.0-rc.2")).toEqual({ kind: "prerelease", version: "16.3.0-rc.2" });
    expect(classifyRef("refs/tags/v16.3.0-beta")).toMatchObject({ kind: "prerelease" });
    for (const other of ["refs/heads/main", "refs/heads/rc/16.3.0", "refs/pull/1/merge", "refs/tags/16.3.0", "refs/tags/v16.3", "refs/tags/tutors-10.0"]) {
      expect(classifyRef(other)).toEqual({ kind: "other" });
    }
  });

  it("takes the highest N, compared as a number", () => {
    expect(pickCandidate(["16.3.0-rc.1", "16.3.0-rc.10", "16.3.0-rc.9", "16.3.0-rc.2"], "16.3.0")).toBe("16.3.0-rc.10");
  });

  it("ignores everything that is not exactly X.Y.Z-rc.N of this version", () => {
    const tags = ["16.3.0", "16.3", "latest", "main", "sha-abcdef0", "rc-16.3.0", "16.3.1-rc.7", "16.3.0-rc.x", "16.3.0-rc.", "16.3.0-rc.1-fix", "16.3.0-rc.01", "116.3.0-rc.5"];
    expect(pickCandidate(tags, "16.3.0")).toBeUndefined();
    expect(pickCandidate([...tags, "16.3.0-rc.3"], "16.3.0")).toBe("16.3.0-rc.3");
  });

  it("gives the release four tags: X.Y.Z, X.Y, latest and sha-<7 of the final commit>", () => {
    expect(tagSet("16.3.0", FINAL_COMMIT)).toEqual(["16.3.0", "16.3", "latest", "sha-bbbbbbb"]);
  });
});

describe("promote-image: the decision", () => {
  it("promotes when the trees are identical, even though the commits differ", () => {
    const w = world();
    expect(RC_COMMIT).not.toBe(FINAL_COMMIT);
    expect(plan(w)).toEqual({
      action: "promote",
      app: "reader",
      image: IMAGE,
      version: "16.3.0",
      rcVersion: "16.3.0-rc.2",
      rcCommit: RC_COMMIT,
      digest: DIGEST,
      tags: ["16.3.0", "16.3", "latest", "sha-bbbbbbb"]
    });
  });

  it("verifies the signature by digest, as image-build.yml at the rc tag, on the rc commit", () => {
    const w = world();
    plan(w);
    expect(w.calls).toContain(`verify ${IMAGE}@${DIGEST} ${identityAt("refs/tags/v16.3.0-rc.2")} ${RC_COMMIT}`);
    expect(identityAt("refs/tags/v16.3.0-rc.2")).toBe("https://github.com/tutors-sdk/tutors-mono-repo/.github/workflows/image-build.yml@refs/tags/v16.3.0-rc.2");
  });

  it("rebuilds when the trees differ, and says which trees", () => {
    const w = world({ trees: { "refs/tags/v16.3.0-rc.2": TREE, [FINAL_COMMIT]: "e".repeat(40) } });
    const result = plan(w);
    expect(result).toMatchObject({ action: "rebuild", app: "reader", version: "16.3.0" });
    expect((result as { reason: string }).reason).toMatch(/1234567890ab.*not the same source.*eeeeeeeeeeee/);
    expect(w.calls.some((call) => call.startsWith("verify"))).toBe(false);
  });

  it("rebuilds when the registry has no candidate for this version", () => {
    for (const tags of [["16.2.2", "main"], ["16.3.1-rc.1"], []]) {
      const result = plan(world({ tags }));
      expect(result).toMatchObject({ action: "rebuild" });
      expect((result as { reason: string }).reason).toMatch(/no 16\.3\.0-rc\.N tag/);
    }
  });

  it("uses only the highest N: an older candidate with a matching tree is not promoted", () => {
    const w = world({
      // rc.1 has the final tree, rc.2 (the one judged last) does not
      trees: { "refs/tags/v16.3.0-rc.1": TREE, "refs/tags/v16.3.0-rc.2": "f".repeat(40), [FINAL_COMMIT]: TREE }
    });
    expect(plan(w)).toMatchObject({ action: "rebuild" });
    expect(w.calls.some((call) => call.includes("rc.1"))).toBe(false);
  });

  it("picks rc.10 over rc.9 when promoting", () => {
    const w = world({
      tags: ["16.3.0-rc.9", "16.3.0-rc.10"],
      commits: { "refs/tags/v16.3.0-rc.10": RC_COMMIT },
      trees: { "refs/tags/v16.3.0-rc.10": TREE, [FINAL_COMMIT]: TREE },
      digests: { [`${IMAGE}:16.3.0-rc.10`]: DIGEST }
    });
    expect(plan(w)).toMatchObject({ action: "promote", rcVersion: "16.3.0-rc.10" });
  });

  it("rebuilds when the image was not built from the rc commit", () => {
    const result = plan(world({ revision: "9".repeat(40) }));
    expect(result).toMatchObject({ action: "rebuild" });
    expect((result as { reason: string }).reason).toMatch(/carries revision 9{40}/);
    expect(plan(world({ revision: undefined }))).toMatchObject({ action: "rebuild" });
  });

  it("rebuilds when the signature does not verify", () => {
    const result = plan(world({ signatureError: "no matching signatures" }));
    expect(result).toMatchObject({ action: "rebuild" });
    expect((result as { reason: string }).reason).toMatch(/not signed by image-build\.yml.*no matching signatures/);
  });

  it("rebuilds when git or the registry cannot answer, never promotes on a guess", () => {
    expect(plan(world({ commits: {} }))).toMatchObject({ action: "rebuild" });
    expect(plan(world({ digests: {} }))).toMatchObject({ action: "rebuild" });
    const { git, registry } = fakes(world());
    const throwing = planImage({ app: "reader", ref: "refs/tags/v16.3.0", sha: FINAL_COMMIT }, git, {
      ...registry,
      listTags: () => {
        throw new Error("HTTP 503");
      }
    });
    expect(throwing).toMatchObject({ action: "rebuild" });
    expect((throwing as { reason: string }).reason).toMatch(/HTTP 503/);
  });
});

describe("promote-image: what is left alone", () => {
  const untouched = ["refs/tags/v16.3.0-rc.1", "refs/tags/v16.3.0-rc.12", "refs/heads/main", "refs/heads/rc/16.3.0", "refs/pull/12/merge"];

  it.each(untouched)("%s builds as before and never reads the registry or git", (ref) => {
    const w = world();
    expect(plan(w, ref)).toMatchObject({ action: "build", app: "reader" });
    expect(w.calls).toEqual([]);
  });

  it("a backfill of a final tag builds as before, even when a candidate exists", () => {
    const w = world();
    expect(plan(w, "refs/tags/v16.3.0", { backfill: true })).toMatchObject({ action: "build" });
    expect(w.calls).toEqual([]);
  });

  it("says nothing and never fails for a build", () => {
    const build = plan(world(), "refs/tags/v16.3.0-rc.1");
    for (const require of [false, true]) {
      expect(outcomeOf(build, require)).toEqual({ promoted: false, annotations: [], summary: [] });
    }
  });
});

describe("promote-image: the fallback is loud, and require_promotion makes it a failure", () => {
  const rebuild = plan(world({ tags: ["16.2.2"] }));
  const promote = plan(world());

  it("a promoted app reports promoted and the digest", () => {
    const outcome = outcomeOf(promote, false);
    expect(outcome.promoted).toBe(true);
    expect(outcome.failure).toBeUndefined();
    expect(outcome.summary.join(" ")).toContain(DIGEST);
    expect(outcome.summary.join(" ")).toContain("PROMOTED");
  });

  it("a rebuild warns and puts REBUILT in the summary, but does not fail", () => {
    const outcome = outcomeOf(rebuild, false);
    expect(outcome.promoted).toBe(false);
    expect(outcome.failure).toBeUndefined();
    expect(outcome.annotations[0]).toMatch(/^::warning /);
    expect(outcome.annotations[0]).toContain(REBUILT_NOTICE);
    expect(outcome.summary[0]).toContain("REBUILT — this image is not the one the release harness judged");
  });

  it("require_promotion turns the same rebuild into a failure that builds nothing", () => {
    const outcome = outcomeOf(rebuild, true);
    expect(outcome.promoted).toBe(false);
    expect(outcome.failure).toMatch(/require_promotion/);
    expect(outcome.annotations[0]).toMatch(/^::error /);
    expect(outcome.summary[0]).not.toContain("REBUILT");
  });

  it("require_promotion does not disturb a promotion", () => {
    expect(outcomeOf(promote, true)).toMatchObject({ promoted: true });
    expect(outcomeOf(promote, true).failure).toBeUndefined();
  });

  it("a dry run names the exact retag it would make", () => {
    const lines = describePlan(promote);
    expect(lines[0]).toContain("WOULD PROMOTE");
    expect(lines.join("\n")).toContain(`docker buildx imagetools create -t ${IMAGE}:16.3.0 -t ${IMAGE}:16.3 -t ${IMAGE}:latest -t ${IMAGE}:sha-bbbbbbb ${IMAGE}@${DIGEST}`);
    expect(describePlan(rebuild)[0]).toContain("WOULD REBUILD");
  });
});

describe("promote-image: applying a promotion", () => {
  const promote = plan(world()) as Extract<Plan, { action: "promote" }>;

  function publisher(overrides: Partial<Publisher> = {}): { publisher: Publisher; log: string[]; moved: Record<string, string> } {
    const log: string[] = [];
    const moved: Record<string, string> = {};
    return {
      log,
      moved,
      publisher: {
        retag: (image, digest, tags) => {
          log.push(`retag ${tags.join(",")}`);
          for (const tag of tags) moved[`${image}:${tag}`] = digest;
        },
        digestOf: (reference) => moved[reference] ?? "sha256:none",
        verifySignature: (reference) => (log.push(`cosign verify ${reference}`), undefined),
        verifyAttestation: (reference) => (log.push(`verify-attestation ${reference}`), undefined),
        ...overrides
      }
    };
  }

  it("retags without building, and every tag ends on the judged digest", () => {
    const { publisher: p, log, moved } = publisher();
    expect(applyPromotion(promote, p)).toEqual([]);
    expect(Object.keys(moved).sort()).toEqual(["16.3", "16.3.0", "latest", "sha-bbbbbbb"].map((tag) => `${IMAGE}:${tag}`).sort());
    expect(new Set(Object.values(moved))).toEqual(new Set([DIGEST]));
    // the signature and the SBOM attestation are looked up on the promoted tag
    expect(log).toContain(`cosign verify ${IMAGE}:16.3.0`);
    expect(log).toContain(`verify-attestation ${IMAGE}:16.3.0`);
  });

  it("moves X.Y and latest only after X.Y.Z has verified", () => {
    const { publisher: p, log } = publisher();
    applyPromotion(promote, p);
    const order = log.filter((entry) => entry.startsWith("retag") || entry.includes("verify"));
    expect(order).toEqual([`retag 16.3.0,sha-bbbbbbb`, `cosign verify ${IMAGE}:16.3.0`, `verify-attestation ${IMAGE}:16.3.0`, "retag 16.3,latest"]);
  });

  it("leaves latest alone when the promoted tag does not verify", () => {
    for (const failing of [{ verifySignature: () => "no signatures" }, { verifyAttestation: () => "no attestations" }]) {
      const { publisher: p, moved } = publisher(failing);
      const problems = applyPromotion(promote, p);
      expect(problems).toHaveLength(1);
      expect(moved[`${IMAGE}:latest`]).toBeUndefined();
      expect(moved[`${IMAGE}:16.3`]).toBeUndefined();
    }
  });

  it("reports a tag that resolves to any other digest", () => {
    const { publisher: p } = publisher({ digestOf: (reference) => (reference.endsWith(":latest") ? `sha256:${"0".repeat(64)}` : DIGEST) });
    const problems = applyPromotion(promote, p);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`${IMAGE}:latest resolves to sha256:${"0".repeat(64)}`);
  });
});

describe(".github/workflows/image-build.yml promotes without a build step", () => {
  interface Step {
    name?: string;
    id?: string;
    if?: string;
    uses?: string;
    run?: string;
    env?: Record<string, string>;
    with?: Record<string, unknown>;
  }
  const text = readFileSync(join(REPO_ROOT, ".github/workflows/image-build.yml"), "utf8").replaceAll("\r\n", "\n");
  const doc = yaml.load(text) as {
    on: { workflow_dispatch: { inputs: Record<string, { default?: unknown; type?: string }> } };
    permissions: Record<string, string>;
    jobs: Record<string, { permissions?: Record<string, string>; steps: Step[] }>;
  };
  const steps = doc.jobs.publish.steps;
  const planAt = steps.findIndex((step) => step.id === "plan");
  const label = (step: Step) => step.name ?? step.uses ?? step.run ?? "(step)";

  const notPromoted = "steps.plan.outputs.promoted != 'true'";
  const promoted = "steps.plan.outputs.promoted == 'true'";
  /** Anything that builds an image, or signs, or attests one. */
  const isBuild = (step: Step) =>
    /^(docker\/build-push-action|docker\/setup-qemu-action|docker\/setup-buildx-action|docker\/metadata-action|anchore\/sbom-action)@/.test(step.uses ?? "") ||
    /\b(docker (buildx )?build|cosign (sign|attest))\b/.test(step.run ?? "");
  /** `a && b && c`: every term must hold, so a gate among them is a real gate; an `||` would let it through. */
  const gatedBy = (step: Step, gate: string) =>
    !!step.if &&
    !step.if.includes("||") &&
    step.if
      .split("&&")
      .map((term) => term.trim())
      .includes(gate);

  it("decides before it does anything else that publishes", () => {
    expect(planAt).toBeGreaterThan(0);
    expect(steps[planAt].if).toBe("steps.what.outputs.final == 'true'");
    expect(steps[planAt].run).toContain("scripts/promote-image.ts plan");
    expect(steps.filter(isBuild).every((step) => steps.indexOf(step) > planAt)).toBe(true);
  });

  it("every build, sign, attest and login step after the decision is skipped for a promoted app", () => {
    const after = steps.slice(planAt + 1);
    const building = after.filter((step) => !gatedBy(step, promoted));
    expect(building.length).toBeGreaterThan(8);
    for (const step of building) expect(gatedBy(step, notPromoted), `${label(step)} must be gated by ${notPromoted}`).toBe(true);
  });

  it("the steps that do run for a promoted app contain no build", () => {
    const promotionPath = steps.filter((step) => gatedBy(step, promoted));
    expect(promotionPath.map(label)).toEqual(["Run Trivy vulnerability scan (promoted digest)", "Login to Quay.io (promotion)", "Promote the release candidate's image"]);
    for (const step of promotionPath) expect(isBuild(step), label(step)).toBe(false);
    for (const step of steps.slice(0, planAt + 1)) expect(isBuild(step), label(step)).toBe(false);
    expect(promotionPath.at(-1)?.run).toContain("scripts/promote-image.ts apply");
  });

  it("scans the promoted digest with the same gate as a build, before any tag moves", () => {
    const scan = steps.find((step) => step.name === "Run Trivy vulnerability scan (promoted digest)")!;
    const build = steps.find((step) => step.name === "Run Trivy vulnerability scan")!;
    expect(scan.with).toMatchObject({ "exit-code": "1", severity: "CRITICAL,HIGH", "ignore-unfixed": true });
    expect(String(scan.with?.["image-ref"])).toContain("@${{ steps.plan.outputs.digest }}");
    expect(scan.uses).toBe(build.uses);
    expect(steps.indexOf(scan)).toBeLessThan(steps.findIndex((step) => step.name === "Promote the release candidate's image"));
  });

  it("only a final tag reaches the decision; the regexp agrees with the script", () => {
    const what = steps.find((step) => step.id === "what")!.run!;
    const pattern = /grep -Eq '(\^refs\/tags\/v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$)'/.exec(what);
    expect(pattern, "the `what` step tests $GITHUB_REF against a final-tag pattern").not.toBeNull();
    const regexp = new RegExp(pattern![1]);
    for (const ref of ["refs/tags/v16.3.0", "refs/tags/v16.3.0-rc.1", "refs/tags/v16.3", "refs/heads/main", "refs/heads/rc/16.3.0", "refs/pull/1/merge"]) {
      expect(regexp.test(ref), ref).toBe(classifyRef(ref).kind === "final");
    }
    // a backfill sets final=false before it can reach the decision
    expect(what).toMatch(/echo "backfill=true" >> "\$GITHUB_OUTPUT"\n\s*echo "final=false"/);
  });

  it("require_promotion is a boolean dispatch input, off by default, and reaches the script through env", () => {
    const input = doc.on.workflow_dispatch.inputs.require_promotion;
    expect(input).toMatchObject({ type: "boolean", default: false });
    const decide = steps[planAt];
    expect(decide.env?.REQUIRE_PROMOTION).toBe("${{ inputs.require_promotion }}");
    expect(decide.run).toContain("--require-promotion");
    expect(decide.run).not.toContain("${{");
  });

  it("gains no permission: promotion retags with the registry login the build already uses", () => {
    expect(doc.permissions).toEqual({ contents: "read" });
    expect(doc.jobs.publish.permissions).toEqual({ contents: "read", "id-token": "write" });
  });

  it("documents the promotion in its header table", () => {
    expect(text).toMatch(/push tag vX\.Y\.Z\s+PROMOTE/);
    expect(text).toMatch(/require_promotion/);
    expect(text).toMatch(/push tag vX\.Y\.Z-rc\.N\s+push {2}X\.Y\.Z-rc\.N/);
  });
});
