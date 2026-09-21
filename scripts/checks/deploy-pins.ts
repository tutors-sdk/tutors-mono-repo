/**
 * The overlays under deploy/k8s/overlays name what production runs, and they
 * name it by digest so that what is deployed cannot drift from what was judged:
 * a tag can be pushed again, a digest cannot. Each overlay carries both, side by
 * side, in the form kustomize renders as `<name>:<tag>@<digest>`:
 *
 *   images:
 *     - name: tutors-app
 *       newName: quay.io/tutors-sdk/tutors-reader
 *       newTag: "16.2.2"        # for people, and for release-dispatch.yml
 *       digest: sha256:7567...  # what the container runtime pulls
 *
 *   pnpm check:deploy-pins                 # the form of every overlay's pin, offline
 *   pnpm check:deploy-pins --registry      # and: each tag still resolves to its digest, and the digest is signed
 *   pnpm check:deploy-pins --json          # after the checks pass, print the version and digests (for workflows)
 *
 * To create or move a pin use `pnpm deploy:pin <version>`, which resolves the
 * digests from the registry and rewrites the overlays.
 */
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { overlayDirs } from "./conformance.ts";
import { DIGEST_PATTERN, resolveDigest, verifySignature, type ResolveDigest, type VerifySignature } from "./lib/registry.ts";
import { REPO_ROOT, readText, toPosix } from "./lib/repo.ts";

/** A release: X.Y.Z. Not a prerelease, `latest`, a branch or `sha-<short>`: production runs releases. */
const RELEASE_TAG = /^\d+\.\d+\.\d+$/;

interface KustomizeImage {
  name?: unknown;
  newName?: unknown;
  newTag?: unknown;
  digest?: unknown;
}

export interface Overlay {
  /** `reader`, `catalogue`, ... */
  app: string;
  /** Repo-relative path of the kustomization. */
  file: string;
  images: KustomizeImage[];
}

/** One overlay's pin, once its form is known to be sound. */
export interface Pin {
  app: string;
  image: string;
  tag: string;
  digest: string;
}

export function readOverlays(root: string = REPO_ROOT): Overlay[] {
  return overlayDirs(root).map((dir) => {
    const file = join(dir, "kustomization.yaml");
    const doc = (yaml.load(readText(file)) ?? {}) as { images?: KustomizeImage[] };
    return { app: basename(dir), file: toPosix(file, root), images: doc.images ?? [] };
  });
}

/** [major, minor, patch] of an X.Y.Z, for ordering. */
function versionParts(version: string): number[] {
  return version.split(".").map(Number);
}

function isAhead(version: string, than: string): boolean {
  const a = versionParts(version);
  const b = versionParts(than);
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * Problems with the form of the pins, without touching a registry. Findings are
 * `rule: overlays/<app>: detail`; an empty list means every overlay carries a
 * digest and a release tag that agree in form.
 *
 * `packageVersion` is the version in the root package.json, the release being
 * built. Overlays describe what is deployed, which lags it until the deploy, so
 * the pinned tag may equal it or be older, never ahead.
 */
export function overlayPinFindings(overlays: Overlay[], options: { packageVersion?: string } = {}): { findings: string[]; pins: Pin[] } {
  const findings: string[] = [];
  const pins: Pin[] = [];

  for (const { app, images } of overlays) {
    const where = `overlays/${app}`;
    if (images.length !== 1) {
      findings.push(`image-entry-count: ${where}: expected one images[] entry, found ${images.length}`);
      continue;
    }
    const [{ newName, newTag, digest }] = images;
    const before = findings.length;

    if (typeof newName !== "string" || newName === "") {
      findings.push(`missing-image-name: ${where}: newName`);
    } else if (newName.includes("@") || newName.lastIndexOf(":") > newName.lastIndexOf("/")) {
      findings.push(`name-carries-tag-or-digest: ${where}: ${newName} (put the tag in newTag and the digest in digest)`);
    }

    if (newTag === undefined) {
      findings.push(`missing-tag: ${where}: newTag (a digest alone tells a person nothing; keep the release tag beside it)`);
    } else if (typeof newTag !== "string") {
      findings.push(`tag-not-string: ${where}: newTag is ${typeof newTag}, quote it`);
    } else if (!RELEASE_TAG.test(newTag)) {
      findings.push(`tag-not-release: ${where}: newTag ${newTag} (production runs a release, X.Y.Z)`);
    }

    if (digest === undefined) {
      findings.push(`missing-digest: ${where}: digest (a tag can move; pin with pnpm deploy:pin <version>)`);
    } else if (typeof digest !== "string" || !DIGEST_PATTERN.test(digest)) {
      findings.push(`malformed-digest: ${where}: ${String(digest)} (expected sha256: and 64 lowercase hex characters)`);
    }

    if (findings.length === before) pins.push({ app, image: newName as string, tag: newTag as string, digest: digest as string });
  }

  const tags = new Set(pins.map((pin) => pin.tag));
  if (tags.size > 1) {
    const listed = pins.map((pin) => `${pin.app}=${pin.tag}`).join(", ");
    findings.push(`tags-differ: overlays: the four apps ship together and must name one release (${listed})`);
  }
  const byDigest = new Map<string, string[]>();
  for (const pin of pins) byDigest.set(pin.digest, [...(byDigest.get(pin.digest) ?? []), pin.app]);
  for (const [digest, apps] of byDigest) {
    if (apps.length > 1) findings.push(`shared-digest: overlays: ${apps.join(", ")} pin one digest (${digest}), but each app is its own image`);
  }
  if (options.packageVersion) {
    for (const pin of pins) {
      if (isAhead(pin.tag, options.packageVersion)) {
        findings.push(`tag-ahead-of-package: overlays/${pin.app}: ${pin.tag} is newer than package.json ${options.packageVersion}`);
      }
    }
  }
  return { findings: findings.sort(), pins };
}

/**
 * What only the registry knows: that each tag still resolves to the digest the
 * overlay pins (tags are immutable by policy, so a mismatch means one was moved
 * or the pin was typed by hand), and that the digest was signed by image-build.yml.
 */
export function registryPinFindings(pins: Pin[], tools: { resolve: ResolveDigest; verify: VerifySignature }): string[] {
  const findings: string[] = [];
  for (const { app, image, tag, digest } of pins) {
    const where = `overlays/${app}`;
    let resolved: string | undefined;
    try {
      resolved = tools.resolve(`${image}:${tag}`);
    } catch (error) {
      findings.push(`tag-not-in-registry: ${where}: ${image}:${tag} (${(error as Error).message.split("\n")[0]})`);
    }
    if (resolved !== undefined && resolved !== digest) {
      findings.push(`tag-digest-mismatch: ${where}: ${image}:${tag} is ${resolved} in the registry, the overlay pins ${digest}`);
    }
    const unsigned = tools.verify(`${image}@${digest}`);
    if (unsigned) findings.push(`unsigned-digest: ${where}: ${image}@${digest} (${unsigned})`);
  }
  return findings.sort();
}

/**
 * Rewrite one overlay's `newTag` and `digest` in place, keeping every comment and
 * the file's line endings; a plain YAML round trip would drop the comments.
 */
export function pinOverlayText(text: string, tag: string, digest: string): string {
  if (!RELEASE_TAG.test(tag)) throw new Error(`not a release tag: ${tag}`);
  if (!DIGEST_PATTERN.test(digest)) throw new Error(`not a digest: ${digest}`);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((line) => /^\s+newTag:/.test(line));
  if (at < 0) throw new Error("no newTag line to pin");
  const indent = /^(\s*)/.exec(lines[at])![1];
  lines[at] = `${indent}newTag: "${tag}"`;
  // A digest line, if any, belongs to the same entry: it sits at the same indent, before the next key of a shallower one.
  let end = at + 1;
  while (end < lines.length && lines[end].startsWith(indent) && lines[end].trim() !== "") end += 1;
  const existing = lines.slice(at + 1, end).findIndex((line) => /^\s*digest:/.test(line));
  if (existing >= 0) lines[at + 1 + existing] = `${indent}digest: ${digest}`;
  else lines.splice(at + 1, 0, `${indent}digest: ${digest}`);
  return lines.join(eol);
}

function main(): void {
  const args = process.argv.slice(2);
  const overlays = readOverlays();
  const packageVersion: string = JSON.parse(readText(join(REPO_ROOT, "package.json"))).version;
  const { findings, pins } = overlayPinFindings(overlays, { packageVersion });
  if (args.includes("--registry") && findings.length === 0) {
    findings.push(...registryPinFindings(pins, { resolve: resolveDigest, verify: verifySignature }));
  }
  if (findings.length > 0) {
    console.error("FAIL: the overlays are not pinned to what production runs:");
    for (const finding of findings) {
      console.error(`  ${finding}`);
      if (process.env.GITHUB_ACTIONS) console.error(`::error file=deploy/k8s/${finding.split(": ")[1]}/kustomization.yaml::${finding}`);
    }
    process.exit(1);
  }
  if (args.includes("--json")) {
    const images = Object.fromEntries(pins.map(({ app, image, tag, digest }) => [app, { image, tag, digest }]));
    console.log(JSON.stringify({ version: pins[0].tag, images }, null, 2));
    return;
  }
  console.log(`OK: ${pins.length} overlays pinned to ${pins[0].tag} by digest${args.includes("--registry") ? ", each resolved and verified in the registry" : ""}.`);
  for (const pin of pins) console.log(`  ${pin.app.padEnd(10)} ${pin.digest}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
