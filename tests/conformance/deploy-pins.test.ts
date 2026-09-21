import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { renderKustomization } from "../../scripts/checks/conformance.ts";
import { overlayPinFindings, pinOverlayText, readOverlays, registryPinFindings, type Overlay, type Pin } from "../../scripts/checks/deploy-pins.ts";
import { COSIGN_IDENTITY } from "../../scripts/checks/lib/registry.ts";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import { COSIGN_IDENTITY_REGEXP, identityAt } from "../../scripts/promote-image.ts";

const DIGESTS = {
  reader: `sha256:${"1".repeat(64)}`,
  catalogue: `sha256:${"2".repeat(64)}`,
  live: `sha256:${"3".repeat(64)}`,
  time: `sha256:${"4".repeat(64)}`
};

/** Four overlays that pass every form rule; negative fixtures break one thing each. */
function pinnedOverlays(): Overlay[] {
  return (Object.keys(DIGESTS) as (keyof typeof DIGESTS)[]).map((app) => ({
    app,
    file: `deploy/k8s/overlays/${app}/kustomization.yaml`,
    images: [{ name: "tutors-app", newName: `quay.io/tutors-sdk/tutors-${app}`, newTag: "16.2.2", digest: DIGESTS[app] }]
  }));
}

function broken(mutate: (overlays: Overlay[]) => void): string[] {
  const overlays = pinnedOverlays();
  mutate(overlays);
  return overlayPinFindings(overlays, { packageVersion: "16.2.2" }).findings;
}

describe("deploy overlays are pinned to what production runs, by digest", () => {
  describe("the committed overlays", () => {
    it("carry a release tag and a digest that agree in form", () => {
      const version = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).version;
      expect(overlayPinFindings(readOverlays(), { packageVersion: version }).findings).toEqual([]);
    });

    it("render as <name>:<tag>@<digest>: readable, and the runtime pulls by digest", () => {
      for (const overlay of readOverlays()) {
        const [{ newName, newTag, digest }] = overlay.images;
        const rendered = renderKustomization(join(REPO_ROOT, "deploy/k8s/overlays", overlay.app));
        expect(rendered).toContain(`image: ${newName}:${newTag}@${digest}`);
      }
    });

    // release-dispatch.yml reads the production tag from the reader overlay with this
    // pattern (a sed in its "Read the production tag from main" step). Pinning a digest
    // beside newTag must not break it.
    it("still yield the production tag to release-dispatch.yml", () => {
      const dispatch = readFileSync(join(REPO_ROOT, ".github/workflows/release-dispatch.yml"), "utf8");
      expect(dispatch).toContain("deploy/k8s/overlays/reader/kustomization.yaml?ref=main");
      expect(dispatch).toContain("newTag:");
      const overlay = readFileSync(join(REPO_ROOT, "deploy/k8s/overlays/reader/kustomization.yaml"), "utf8");
      const tags = [...overlay.matchAll(/^[ \t]*newTag:[ \t]*"?([^"\s]*)"?[ \t]*$/gm)].map((match) => match[1]);
      expect(tags).toEqual([readOverlays().find((o) => o.app === "reader")!.images[0].newTag]);
    });
  });

  describe("form policies", () => {
    it("accept four pinned overlays, a tag older than package.json, and return their pins", () => {
      const overlays = pinnedOverlays();
      expect(overlayPinFindings(overlays, { packageVersion: "16.2.2" }).findings).toEqual([]);
      expect(overlayPinFindings(overlays, { packageVersion: "16.3.0-rc.1" }).findings).toEqual([]);
      expect(overlayPinFindings(overlays, { packageVersion: "17.0.0" }).pins.map((pin) => pin.app)).toEqual(["reader", "catalogue", "live", "time"]);
    });

    it.each<[string, (overlays: Overlay[]) => void]>([
      [
        "missing-digest: overlays/reader: digest (a tag can move; pin with pnpm deploy:pin <version>)",
        (o) => delete o[0].images[0].digest
      ],
      [
        "missing-tag: overlays/reader: newTag (a digest alone tells a person nothing; keep the release tag beside it)",
        (o) => delete o[0].images[0].newTag
      ],
      [
        "malformed-digest: overlays/reader: sha256:abc (expected sha256: and 64 lowercase hex characters)",
        (o) => (o[0].images[0].digest = "sha256:abc")
      ],
      [
        `malformed-digest: overlays/reader: ${"A".repeat(64)} (expected sha256: and 64 lowercase hex characters)`,
        (o) => (o[0].images[0].digest = "A".repeat(64))
      ],
      [
        `malformed-digest: overlays/reader: sha256:${"F".repeat(64)} (expected sha256: and 64 lowercase hex characters)`,
        (o) => (o[0].images[0].digest = `sha256:${"F".repeat(64)}`)
      ],
      ["tag-not-release: overlays/reader: newTag latest (production runs a release, X.Y.Z)", (o) => (o[0].images[0].newTag = "latest")],
      ["tag-not-release: overlays/reader: newTag 16.3.0-rc.1 (production runs a release, X.Y.Z)", (o) => (o[0].images[0].newTag = "16.3.0-rc.1")],
      ["tag-not-release: overlays/reader: newTag sha-1a2b3c4 (production runs a release, X.Y.Z)", (o) => (o[0].images[0].newTag = "sha-1a2b3c4")],
      ["tag-not-release: overlays/reader: newTag 16.2.2@sha256:abc (production runs a release, X.Y.Z)", (o) => (o[0].images[0].newTag = "16.2.2@sha256:abc")],
      ["tag-not-string: overlays/reader: newTag is number, quote it", (o) => (o[0].images[0].newTag = 16.2)],
      [
        "name-carries-tag-or-digest: overlays/reader: quay.io/tutors-sdk/tutors-reader:16.2.2 (put the tag in newTag and the digest in digest)",
        (o) => (o[0].images[0].newName = "quay.io/tutors-sdk/tutors-reader:16.2.2")
      ],
      [
        `name-carries-tag-or-digest: overlays/reader: quay.io/tutors-sdk/tutors-reader@${DIGESTS.reader} (put the tag in newTag and the digest in digest)`,
        (o) => (o[0].images[0].newName = `quay.io/tutors-sdk/tutors-reader@${DIGESTS.reader}`)
      ],
      ["missing-image-name: overlays/reader: newName", (o) => delete o[0].images[0].newName],
      ["image-entry-count: overlays/reader: expected one images[] entry, found 0", (o) => (o[0].images = [])],
      [
        "tags-differ: overlays: the four apps ship together and must name one release (reader=16.2.1, catalogue=16.2.2, live=16.2.2, time=16.2.2)",
        (o) => (o[0].images[0].newTag = "16.2.1")
      ],
      [
        `shared-digest: overlays: reader, live pin one digest (${DIGESTS.reader}), but each app is its own image`,
        (o) => (o[2].images[0].digest = DIGESTS.reader)
      ]
    ])("negative fixture: %s", (expected, mutate) => {
      expect(broken(mutate)).toContain(expected);
    });

    it("refuses a tag newer than the release being built", () => {
      expect(overlayPinFindings(pinnedOverlays(), { packageVersion: "16.2.1" }).findings).toContain(
        "tag-ahead-of-package: overlays/reader: 16.2.2 is newer than package.json 16.2.1"
      );
      expect(overlayPinFindings(pinnedOverlays(), { packageVersion: "16.10.0" }).findings).toEqual([]);
    });

    it("does not report a broken overlay's tag twice", () => {
      const findings = broken((o) => delete o[0].images[0].digest);
      expect(findings).toHaveLength(1);
    });
  });

  describe("registry policies", () => {
    const pins: Pin[] = overlayPinFindings(pinnedOverlays()).pins;
    const image = (app: string) => `quay.io/tutors-sdk/tutors-${app}`;
    const registry = (resolved: Record<string, string>, unsigned: string[] = []) => ({
      resolve: (ref: string) => {
        const digest = resolved[ref];
        if (!digest) throw new Error(`${ref}: not found`);
        return digest;
      },
      verify: (ref: string) => (unsigned.some((app) => ref.startsWith(`${image(app)}@`)) ? "no matching signatures" : undefined)
    });
    const inRegistry = Object.fromEntries(pins.map((pin) => [`${pin.image}:${pin.tag}`, pin.digest]));

    it("accepts tags that resolve to their pinned, signed digests", () => {
      expect(registryPinFindings(pins, registry(inRegistry))).toEqual([]);
    });

    it("fails when a tag now resolves to another digest", () => {
      const moved = { ...inRegistry, [`${image("live")}:16.2.2`]: `sha256:${"9".repeat(64)}` };
      expect(registryPinFindings(pins, registry(moved))).toEqual([
        `tag-digest-mismatch: overlays/live: ${image("live")}:16.2.2 is sha256:${"9".repeat(64)} in the registry, the overlay pins ${DIGESTS.live}`
      ]);
    });

    it("fails when the tag is not in the registry", () => {
      const rest = { ...inRegistry };
      delete rest[`${image("time")}:16.2.2`];
      expect(registryPinFindings(pins, registry(rest))).toEqual([
        `tag-not-in-registry: overlays/time: ${image("time")}:16.2.2 (${image("time")}:16.2.2: not found)`
      ]);
    });

    it("fails when the pinned digest is not signed by image-build.yml", () => {
      expect(registryPinFindings(pins, registry(inRegistry, ["reader"]))).toEqual([
        `unsigned-digest: overlays/reader: ${image("reader")}@${DIGESTS.reader} (no matching signatures)`
      ]);
    });
  });

  describe("signing identity", () => {
    const signer = new RegExp(COSIGN_IDENTITY);

    it("accepts image-build.yml at the final tag ref (a rebuilt image) and at the rc tag ref (a promoted image)", () => {
      expect(signer.test(identityAt("refs/tags/v16.3.0"))).toBe(true);
      expect(signer.test(identityAt("refs/tags/v16.3.0-rc.2"))).toBe(true);
    });

    it("rejects other workflows and other repositories", () => {
      const at = "@refs/tags/v16.3.0";
      expect(signer.test(`https://github.com/tutors-sdk/tutors-mono-repo/.github/workflows/other.yml${at}`)).toBe(false);
      expect(signer.test(`https://github.com/someone-else/tutors-mono-repo/.github/workflows/image-build.yml${at}`)).toBe(false);
    });

    it("is the one identity that promote-image.ts verifies with, defined once", () => {
      expect(COSIGN_IDENTITY_REGEXP).toBe(COSIGN_IDENTITY);
    });
  });

  describe("pinning", () => {
    const before = [
      "images:",
      "  - name: tutors-app",
      "    newName: quay.io/tutors-sdk/tutors-reader",
      '    newTag: "16.2.1" # released',
      "",
      "patches:",
      "  - target:",
      "      kind: ConfigMap",
      ""
    ].join("\n");

    it("adds the digest under newTag and moves the tag, keeping every comment", () => {
      const after = pinOverlayText(before, "16.2.2", DIGESTS.reader);
      expect(after).toBe(before.replace('newTag: "16.2.1" # released', `newTag: "16.2.2"\n    digest: ${DIGESTS.reader}`));
    });

    it("replaces an existing digest instead of adding a second", () => {
      const once = pinOverlayText(before, "16.2.2", DIGESTS.reader);
      const twice = pinOverlayText(once, "16.3.0", DIGESTS.live);
      expect(twice.match(/digest:/g)).toHaveLength(1);
      expect(yaml.load(twice)).toMatchObject({ images: [{ newTag: "16.3.0", digest: DIGESTS.live }] });
      expect(pinOverlayText(twice, "16.3.0", DIGESTS.live)).toBe(twice);
    });

    it("keeps CRLF line endings", () => {
      const after = pinOverlayText(before.replaceAll("\n", "\r\n"), "16.2.2", DIGESTS.reader);
      expect(after).toContain(`digest: ${DIGESTS.reader}\r\n`);
      expect(after.replaceAll("\r\n", "")).not.toContain("\n");
    });

    it("refuses what is not a release tag or a digest", () => {
      expect(() => pinOverlayText(before, "16.3.0-rc.1", DIGESTS.reader)).toThrow("not a release tag");
      expect(() => pinOverlayText(before, "16.2.2", "sha256:abc")).toThrow("not a digest");
      expect(() => pinOverlayText("images: []\n", "16.2.2", DIGESTS.reader)).toThrow("no newTag line");
    });
  });
});

/** The parts of a workflow file the deploy relies on, read from the committed YAML. */
interface Workflow {
  on: Record<string, unknown>;
  permissions: unknown;
  jobs: Record<
    string,
    { needs?: string; if?: string; environment?: string; permissions?: Record<string, string>; steps: { name?: string; run?: string; env?: Record<string, string>; uses?: string }[] }
  >;
}

describe("deploy.yml tells the release harness only after the overlays are verified", () => {
  const text = readFileSync(join(REPO_ROOT, ".github/workflows/deploy.yml"), "utf8");
  const workflow = yaml.load(text) as Workflow;
  const announce = workflow.jobs.announce;
  const steps = announce.steps;
  const indexOf = (needle: string) => steps.findIndex((step) => step.run?.includes(needle));

  it("holds no permission by default and reads the repository in the verify job only", () => {
    expect(workflow.permissions).toEqual({});
    expect(workflow.jobs.verify.permissions).toEqual({ contents: "read" });
    expect(announce.permissions).toEqual({});
  });

  it("announces only after verify, never for a pull request, and in the production environment", () => {
    expect(announce.needs).toBe("verify");
    expect(announce.if).toContain("github.event_name != 'pull_request'");
    expect(announce.if).toContain("needs.verify.outputs.changed == 'true'");
    expect(announce.environment).toBe("production");
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "push", "workflow_dispatch"]);
  });

  it("sets HARNESS_PRODUCTION_TAG on the harness repository, then dispatches deployed", () => {
    const setVariable = indexOf("gh variable set HARNESS_PRODUCTION_TAG --repo \"$HARNESS_REPO\"");
    const dispatch = indexOf('gh api "repos/$HARNESS_REPO/dispatches"');
    expect(setVariable).toBeGreaterThanOrEqual(0);
    expect(dispatch).toBeGreaterThan(setVariable);
    expect(steps[dispatch].run).toContain('event_type: "deployed"');
    expect(text).toContain("HARNESS_REPO: tutors-sdk/tutors-release-harness");
  });

  it("uses HARNESS_TOKEN for both calls, and the verify job never sees it", () => {
    for (const step of steps.filter((s) => s.run?.includes("gh variable set") || s.run?.includes("/dispatches"))) {
      expect(step.env?.GH_TOKEN).toBe("${{ secrets.HARNESS_TOKEN }}");
    }
    expect(JSON.stringify(workflow.jobs.verify)).not.toContain("secrets.");
  });

  it("verifies against the registry before announcing", () => {
    const check = workflow.jobs.verify.steps.find((step) => step.run?.includes("check:deploy-pins"));
    expect(check?.run).toContain("--registry");
  });
});
