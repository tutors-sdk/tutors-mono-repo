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
  process.stdout.write("╔══════════════════════════════════════════════════════╗\n");
  process.stdout.write("║          Artifact Regression Comparison              ║\n");
  process.stdout.write("╚══════════════════════════════════════════════════════╝\n");
  process.stdout.write(`\n  Baseline:  ${BASELINE_DIR}\n`);
  process.stdout.write(`  Candidate: ${CANDIDATE_DIR}\n\n`);

  // Verify directories exist
  try {
    await Deno.stat(BASELINE_DIR);
    await Deno.stat(CANDIDATE_DIR);
  } catch {
    process.stderr.write("[compare] Baseline or candidate directory not found.\n");
    process.stderr.write("[compare] Run generate-baseline.ts and generate-candidate.ts first.\n");
    Deno.exit(1);
  }

  // Phase 1: Semantic JSON comparison
  process.stdout.write("Phase 1: Semantic JSON comparison...\n");
  const jsonResults = await compareDirectoryContents(BASELINE_DIR, CANDIDATE_DIR);

  // Phase 2: Binary comparison (all files)
  process.stdout.write("Phase 2: Binary (byte-level) comparison...\n");
  const binaryResults = await compareBinaryDirectories(BASELINE_DIR, CANDIDATE_DIR);

  // Merge results, deduplicating JSON files (JSON semantic diff takes precedence)
  const jsonPaths = new Set(jsonResults.map((r) => r.path));
  const nonJsonBinaryResults = binaryResults.filter((r) => !jsonPaths.has(r.path));
  const allResults = [...jsonResults, ...nonJsonBinaryResults];

  const errors = allResults.filter((r) => r.severity === "error");
  const warnings = allResults.filter((r) => r.severity === "warning");
  const info = allResults.filter((r) => r.severity === "info");

  // Print summary
  process.stdout.write(`\n${"─".repeat(60)}\n`);
  process.stdout.write(`Results: ${errors.length} errors, ${warnings.length} warnings, ${info.length} info\n`);

  if (errors.length > 0) {
    process.stderr.write("\nERRORS (release blocking):\n");
    for (const e of errors) {
      process.stderr.write(`  ✗ ${e.path}: ${e.message}\n`);
    }
  }

  if (warnings.length > 0) {
    process.stderr.write("\nWARNINGS (review required):\n");
    for (const w of warnings) {
      process.stderr.write(`  ⚠ ${w.path}: ${w.message}\n`);
    }
  }

  if (info.length > 0) {
    process.stdout.write("\nINFO:\n");
    for (const i of info) {
      process.stdout.write(`  ℹ ${i.path}: ${i.message}\n`);
    }
  }

  // Write report if requested
  if (args.report) {
    const reportPath = resolve(args.report);
    await Deno.writeTextFile(
      reportPath,
      JSON.stringify({ errors, warnings, info, summary: { errors: errors.length, warnings: warnings.length, info: info.length } }, null, 2)
    );
    process.stdout.write(`\nReport written to ${reportPath}\n`);
  }

  if (errors.length > 0) {
    process.stderr.write(`\nFAIL: ${errors.length} release-blocking differences found.\n`);
    Deno.exit(1);
  }

  if (warnings.length > 0) {
    process.stderr.write(`\nPASS with warnings: ${warnings.length} differences to review.\n`);
  } else {
    process.stdout.write("\nPASS: Baseline and candidate are identical.\n");
  }
}

await run();
