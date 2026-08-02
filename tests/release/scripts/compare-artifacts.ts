/**
 * Compares baseline vs candidate artifacts using both semantic JSON diff
 * and byte-level binary comparison.
 *
 * JSON files get deep semantic diff (normalised keys, ignored timestamps).
 * All other files get SHA-256 hash comparison.
 */

import { parseArgs } from "jsr:@std/cli/parse-args";
import { resolve } from "jsr:@std/path";
import { compareDirectoryContents, type ComparisonResult } from "../comparators/json-comparator.ts";
import { compareBinaryDirectories } from "../comparators/binary-comparator.ts";

const args = parseArgs(Deno.args, {
  string: ["report", "baseline", "candidate"],
  default: {
    report: "",
    baseline: "./tests/release/.release-work/baseline",
    candidate: "./tests/release/.release-work/candidate",
  },
});

const BASELINE_DIR = resolve(args.baseline);
const CANDIDATE_DIR = resolve(args.candidate);

async function run() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║          Artifact Regression Comparison              ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\n  Baseline:  ${BASELINE_DIR}`);
  console.log(`  Candidate: ${CANDIDATE_DIR}\n`);

  // Verify directories exist
  try {
    await Deno.stat(BASELINE_DIR);
    await Deno.stat(CANDIDATE_DIR);
  } catch {
    console.error("[compare] Baseline or candidate directory not found.");
    console.error("[compare] Run generate-baseline.ts and generate-candidate.ts first.");
    Deno.exit(1);
  }

  // Phase 1: Semantic JSON comparison
  console.log("Phase 1: Semantic JSON comparison...");
  const jsonResults = await compareDirectoryContents(BASELINE_DIR, CANDIDATE_DIR);

  // Phase 2: Binary comparison (all files)
  console.log("Phase 2: Binary (byte-level) comparison...");
  const binaryResults = await compareBinaryDirectories(BASELINE_DIR, CANDIDATE_DIR);

  // Merge results, deduplicating JSON files (JSON semantic diff takes precedence)
  const jsonPaths = new Set(jsonResults.map((r) => r.path));
  const nonJsonBinaryResults = binaryResults.filter((r) => !jsonPaths.has(r.path));
  const allResults = [...jsonResults, ...nonJsonBinaryResults];

  const errors = allResults.filter((r) => r.severity === "error");
  const warnings = allResults.filter((r) => r.severity === "warning");
  const info = allResults.filter((r) => r.severity === "info");

  // Print summary
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Results: ${errors.length} errors, ${warnings.length} warnings, ${info.length} info`);

  if (errors.length > 0) {
    console.error("\nERRORS (release blocking):");
    for (const e of errors) {
      console.error(`  ✗ ${e.path}: ${e.message}`);
    }
  }

  if (warnings.length > 0) {
    console.warn("\nWARNINGS (review required):");
    for (const w of warnings) {
      console.warn(`  ⚠ ${w.path}: ${w.message}`);
    }
  }

  if (info.length > 0) {
    console.log("\nINFO:");
    for (const i of info) {
      console.log(`  ℹ ${i.path}: ${i.message}`);
    }
  }

  // Write report if requested
  if (args.report) {
    const reportPath = resolve(args.report);
    await Deno.writeTextFile(
      reportPath,
      JSON.stringify({ errors, warnings, info, summary: { errors: errors.length, warnings: warnings.length, info: info.length } }, null, 2)
    );
    console.log(`\nReport written to ${reportPath}`);
  }

  if (errors.length > 0) {
    console.error(`\nFAIL: ${errors.length} release-blocking differences found.`);
    Deno.exit(1);
  }

  if (warnings.length > 0) {
    console.warn(`\nPASS with warnings: ${warnings.length} differences to review.`);
  } else {
    console.log("\nPASS: Baseline and candidate are identical.");
  }
}

await run();
