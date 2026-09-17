/**
 * Render every kustomize overlay and check it against the platform policies
 * in conformance.ts (runway tier J).
 *
 *   pnpm check:k8s                    # render + policy check
 *   pnpm check:k8s --out rendered/    # also write each overlay for kubeconform
 *
 * Images must carry the release tag from the root package.json, so the
 * overlays always describe the version that is (or is about to be) deployed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import yaml from "js-yaml";
import { manifestPolicyFindings, overlayDirs, renderKustomization } from "./conformance.ts";
import { REPO_ROOT, readText, toPosix } from "./lib/repo.ts";

const outIndex = process.argv.indexOf("--out");
const outDir = outIndex > 0 ? resolve(process.argv[outIndex + 1]) : undefined;
const expectedTag: string = JSON.parse(readText(join(REPO_ROOT, "package.json"))).version;

let failures = 0;
if (outDir) mkdirSync(outDir, { recursive: true });

for (const dir of overlayDirs()) {
  const rendered = renderKustomization(dir);
  if (outDir) writeFileSync(join(outDir, `${basename(dir)}.yaml`), rendered);
  const findings = manifestPolicyFindings(yaml.loadAll(rendered) as Record<string, unknown>[], { expectedTag });
  const label = toPosix(dir);
  if (findings.length === 0) {
    console.log(`ok   ${label}`);
    continue;
  }
  failures += findings.length;
  console.log(`FAIL ${label}`);
  for (const finding of findings) {
    console.log(`     ${finding}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error file=${label}/kustomization.yaml::${finding}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} policy finding(s). Policies and their reasons: scripts/checks/conformance.ts`);
  process.exit(1);
}
