/**
 * Render every kustomize overlay and substrate variant (overlay + Ingress or
 * Route) and check it against the platform policies in conformance.ts (runway
 * tier J).
 *
 *   pnpm check:k8s                    # render + policy check
 *   pnpm check:k8s --out rendered/    # also write each overlay for kubeconform
 *
 * Images must be pinned by digest: the overlays name what production runs, and a
 * tag can be pushed again. The pins' own form (a release tag beside the digest,
 * one release across the four apps) is checked by scripts/checks/deploy-pins.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { entryPointPolicyFindings, manifestPolicyFindings, overlayDirs, renderKustomization, variantDirs } from "./conformance.ts";
import { REPO_ROOT, toPosix } from "./lib/repo.ts";

const outIndex = process.argv.indexOf("--out");
const outDir = outIndex > 0 ? resolve(process.argv[outIndex + 1]) : undefined;

let failures = 0;
if (outDir) mkdirSync(outDir, { recursive: true });

for (const dir of [...overlayDirs(), ...variantDirs()]) {
  const rendered = renderKustomization(dir);
  // overlays/reader -> reader.yaml, variants/kind/reader -> kind-reader.yaml
  const outName = toPosix(dir, join(REPO_ROOT, "deploy/k8s")).replace(/^(overlays|variants)\//, "").replaceAll("/", "-");
  if (outDir) writeFileSync(join(outDir, `${outName}.yaml`), rendered);
  const docs = yaml.loadAll(rendered) as Record<string, unknown>[];
  const findings = [...manifestPolicyFindings(docs, { requireDigest: true }), ...entryPointPolicyFindings(docs)];
  const label = toPosix(dir);
  if (findings.length === 0) {
    process.stdout.write(`ok   ${label}\n`);
    continue;
  }
  failures += findings.length;
  process.stdout.write(`FAIL ${label}\n`);
  for (const finding of findings) {
    process.stdout.write(`     ${finding}\n`);
    if (process.env.GITHUB_ACTIONS) process.stdout.write(`::error file=${label}/kustomization.yaml::${finding}\n`);
  }
}

if (failures > 0) {
  process.stderr.write(`\n${failures} policy finding(s). Policies and their reasons: scripts/checks/conformance.ts\n`);
  process.exit(1);
}
