/**
 * Pin the deploy overlays to a published release, by digest.
 *
 *   pnpm deploy:pin 16.3.0              # resolve, verify, rewrite deploy/k8s/overlays/*
 *   pnpm deploy:pin 16.3.0 --dry-run    # resolve and verify, change nothing
 *
 * Run it after the vX.Y.Z tag has been pushed and image-build.yml has published
 * quay.io/tutors-sdk/tutors-<app>:X.Y.Z. For each overlay it asks the registry
 * which digest that tag is, checks the digest is signed by image-build.yml
 * (cosign verify, by digest), and writes `newTag` and `digest` side by side.
 * Then open a pull request; deploy.yml verifies the same pins again and, once the
 * pull request is merged and the rollout confirmed, tells the release harness.
 *
 * Needs docker (buildx) and cosign 3 or later on the PATH. The registry is public.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { overlayPinFindings, pinOverlayText, readOverlays } from "./checks/deploy-pins.ts";
import { resolveDigest, verifySignature } from "./checks/lib/registry.ts";
import { REPO_ROOT } from "./checks/lib/repo.ts";

const args = process.argv.slice(2);
const version = args.find((arg) => !arg.startsWith("-"))?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("usage: pnpm deploy:pin <X.Y.Z> [--dry-run]   (a release; not a release candidate)");
  process.exit(2);
}
const dryRun = args.includes("--dry-run");

const overlays = readOverlays();
const rewrites: { file: string; text: string }[] = [];
let failed = false;

for (const { app, file, images } of overlays) {
  const image = images[0]?.newName;
  if (typeof image !== "string") {
    console.error(`FAIL ${app}: ${file} has no images[0].newName to pin`);
    failed = true;
    continue;
  }
  try {
    const digest = resolveDigest(`${image}:${version}`);
    const unsigned = verifySignature(`${image}@${digest}`);
    if (unsigned) throw new Error(`not signed by image-build.yml: ${unsigned}`);
    const path = join(REPO_ROOT, file);
    rewrites.push({ file: path, text: pinOverlayText(readFileSync(path, "utf8"), version, digest) });
    console.log(`ok   ${app.padEnd(10)} ${image}:${version}@${digest}`);
  } catch (error) {
    console.error(`FAIL ${app}: ${image}:${version}: ${(error as Error).message.split("\n")[0]}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nNothing was written. Is the vX.Y.Z tag pushed, and has image-build.yml finished for all four apps?");
  process.exit(1);
}
if (dryRun) {
  console.log("\n--dry-run: nothing was written.");
  process.exit(0);
}
// All four resolved and verified: write together, so a failure cannot leave a mixed pin.
for (const { file, text } of rewrites) writeFileSync(file, text);

const packageVersion: string = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).version;
const { findings } = overlayPinFindings(readOverlays(), { packageVersion });
if (findings.length > 0) {
  console.error("\nThe rewritten overlays fail the pin check:");
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`\nPinned ${overlays.length} overlays to ${version}. Next: pnpm check:k8s, commit, open a pull request.`);
