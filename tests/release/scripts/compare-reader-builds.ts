/**
 * Compares SvelteKit reader builds between baseline (main branch) and candidate (current).
 * Uses the Vite manifest to detect chunk changes and size regressions.
 *
 * Baseline: build from main branch via git stash/worktree
 * Candidate: build from current working tree
 */

import { parseArgs } from "jsr:@std/cli/parse-args";
import { resolve } from "jsr:@std/path";
import type { ComparisonResult } from "../comparators/json-comparator.ts";

const args = parseArgs(Deno.args, {
  string: ["report"],
  default: { report: "" },
});

const WORK_DIR = resolve("./tests/release/.release-work");
const BASELINE_BUILD = resolve(`${WORK_DIR}/reader-baseline`);
const CANDIDATE_BUILD = resolve(`${WORK_DIR}/reader-candidate`);
const SIZE_REGRESSION_THRESHOLD = 5; // percent

interface ManifestEntry {
  file: string;
  src?: string;
  isEntry?: boolean;
  css?: string[];
  imports?: string[];
}

type ViteManifest = Record<string, ManifestEntry>;

async function buildReader(outputDir: string, label: string): Promise<void> {
  process.stdout.write(`[reader-${label}] Building reader app...\n`);

  const build = new Deno.Command("pnpm", {
    args: ["--filter", "tutors-reader...", "build"],
  });

  const result = await build.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    process.stderr.write(`[reader-${label}] Build failed: ${stderr}\n`);
    Deno.exit(1);
  }

  // Copy build output to work dir
  const buildOutputDir = resolve("./apps/reader/.svelte-kit/output");
  try {
    await Deno.stat(buildOutputDir);
  } catch {
    process.stderr.write(`[reader-${label}] Build output not found at ${buildOutputDir}\n`);
    Deno.exit(1);
  }

  try {
    await Deno.remove(outputDir, { recursive: true });
  } catch { /* may not exist */ }

  await copyDir(buildOutputDir, outputDir);
  process.stdout.write(`[reader-${label}] Build output copied to ${outputDir}\n`);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await Deno.mkdir(dest, { recursive: true });
  for await (const entry of Deno.readDir(src)) {
    const srcPath = `${src}/${entry.name}`;
    const destPath = `${dest}/${entry.name}`;
    if (entry.isDirectory) {
      await copyDir(srcPath, destPath);
    } else {
      await Deno.copyFile(srcPath, destPath);
    }
  }
}

async function findManifest(buildDir: string): Promise<ViteManifest | null> {
  const candidates = [
    `${buildDir}/.vite/manifest.json`,
    `${buildDir}/client/.vite/manifest.json`,
  ];

  for (const path of candidates) {
    try {
      const content = await Deno.readTextFile(path);
      return JSON.parse(content) as ViteManifest;
    } catch { /* try next */ }
  }
  return null;
}

function compareManifests(baseline: ViteManifest, candidate: ViteManifest): ComparisonResult[] {
  const results: ComparisonResult[] = [];
  const baselineKeys = new Set(Object.keys(baseline));
  const candidateKeys = new Set(Object.keys(candidate));

  for (const key of baselineKeys) {
    if (!candidateKeys.has(key)) {
      results.push({
        path: `manifest:${key}`,
        severity: "warning",
        message: `Chunk removed: ${baseline[key].file}`,
      });
    }
  }

  for (const key of candidateKeys) {
    if (!baselineKeys.has(key)) {
      results.push({
        path: `manifest:${key}`,
        severity: "info",
        message: `New chunk: ${candidate[key].file}`,
      });
    }
  }

  for (const key of baselineKeys) {
    if (!candidateKeys.has(key)) continue;

    const base = baseline[key];
    const cand = candidate[key];

    if (base.file !== cand.file) {
      results.push({
        path: `manifest:${key}`,
        severity: "info",
        message: `Chunk hash changed: ${base.file} → ${cand.file}`,
      });
    }

    const baseCss = new Set(base.css ?? []);
    const candCss = new Set(cand.css ?? []);
    for (const css of baseCss) {
      if (!candCss.has(css)) {
        results.push({
          path: `manifest:${key}`,
          severity: "info",
          message: `CSS removed: ${css}`,
        });
      }
    }
    for (const css of candCss) {
      if (!baseCss.has(css)) {
        results.push({
          path: `manifest:${key}`,
          severity: "info",
          message: `CSS added: ${css}`,
        });
      }
    }
  }

  return results;
}

async function compareChunkSizes(baselineDir: string, candidateDir: string, baseline: ViteManifest, candidate: ViteManifest): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  for (const key of Object.keys(baseline)) {
    if (!(key in candidate)) continue;

    const baseFile = baseline[key].file;
    const candFile = candidate[key].file;

    try {
      const baseStat = await Deno.stat(`${baselineDir}/client/${baseFile}`);
      const candStat = await Deno.stat(`${candidateDir}/client/${candFile}`);

      const sizeDelta = candStat.size - baseStat.size;
      const pctChange = baseStat.size > 0
        ? (sizeDelta / baseStat.size) * 100
        : 0;

      if (Math.abs(pctChange) > SIZE_REGRESSION_THRESHOLD) {
        results.push({
          path: `size:${key}`,
          severity: pctChange > SIZE_REGRESSION_THRESHOLD ? "warning" : "info",
          message: `Size ${pctChange > 0 ? "increased" : "decreased"} by ${Math.abs(pctChange).toFixed(1)}%: ${baseStat.size} → ${candStat.size} bytes`,
        });
      }
    } catch {
      // chunk file may not exist at expected location
    }
  }

  return results;
}

async function run() {
  process.stdout.write("╔══════════════════════════════════════════════════════╗\n");
  process.stdout.write("║          Reader Build Comparison                     ║\n");
  process.stdout.write("╚══════════════════════════════════════════════════════╝\n\n");

  // Build candidate from current working tree
  await buildReader(CANDIDATE_BUILD, "candidate");

  // Stash current changes, build baseline from main, restore
  process.stdout.write("\n[reader-baseline] Stashing changes and checking out main...\n");
  const stash = new Deno.Command("git", { args: ["stash", "--include-untracked"] });
  const stashResult = await stash.output();
  const didStash = new TextDecoder().decode(stashResult.stdout).includes("Saved working directory");

  try {
    const checkout = new Deno.Command("git", { args: ["checkout", "main"] });
    const checkoutResult = await checkout.output();
    if (!checkoutResult.success) {
      process.stderr.write("[reader-baseline] Failed to checkout main\n");
      Deno.exit(1);
    }

    await buildReader(BASELINE_BUILD, "baseline");
  } finally {
    // Always restore original state
    const currentBranch = new Deno.Command("git", { args: ["rev-parse", "--abbrev-ref", "HEAD"] });
    const branchResult = await currentBranch.output();
    const branch = new TextDecoder().decode(branchResult.stdout).trim();

    if (branch === "main") {
      const checkoutBack = new Deno.Command("git", { args: ["checkout", "-"] });
      await checkoutBack.output();
    }

    if (didStash) {
      const pop = new Deno.Command("git", { args: ["stash", "pop"] });
      await pop.output();
    }
  }

  // Compare Vite manifests
  process.stdout.write("\nComparing build manifests...\n");
  const baselineManifest = await findManifest(BASELINE_BUILD);
  const candidateManifest = await findManifest(CANDIDATE_BUILD);

  if (!baselineManifest || !candidateManifest) {
    process.stderr.write("[reader] Could not find Vite manifest in one or both builds.\n");
    if (!baselineManifest) process.stderr.write("  Missing: baseline\n");
    if (!candidateManifest) process.stderr.write("  Missing: candidate\n");
    Deno.exit(1);
  }

  const manifestResults = compareManifests(baselineManifest, candidateManifest);
  const sizeResults = await compareChunkSizes(BASELINE_BUILD, CANDIDATE_BUILD, baselineManifest, candidateManifest);
  const allResults = [...manifestResults, ...sizeResults];

  const errors = allResults.filter((r) => r.severity === "error");
  const warnings = allResults.filter((r) => r.severity === "warning");
  const info = allResults.filter((r) => r.severity === "info");

  process.stdout.write(`\n${"─".repeat(60)}\n`);
  process.stdout.write(`Results: ${errors.length} errors, ${warnings.length} warnings, ${info.length} info\n`);

  for (const r of allResults) {
    const icon = r.severity === "error" ? "✗" : r.severity === "warning" ? "⚠" : "ℹ";
    process.stdout.write(`  ${icon} ${r.path}: ${r.message}\n`);
  }

  if (args.report) {
    const reportPath = resolve(args.report);
    await Deno.writeTextFile(
      reportPath,
      JSON.stringify({ errors, warnings, info }, null, 2)
    );
    process.stdout.write(`\nReport written to ${reportPath}\n`);
  }

  if (warnings.length > 0) {
    process.stderr.write(`\n${warnings.length} size regressions or chunk changes to review.\n`);
  } else {
    process.stdout.write("\nNo significant build differences detected.\n");
  }
}

await run();
