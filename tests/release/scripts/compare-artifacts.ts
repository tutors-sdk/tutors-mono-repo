/**
 * Deep semantic diff of baseline vs candidate JSON artifacts.
 * Hard-fails on: missing files, removed fields, changed LO routes, structural type changes.
 * Warns on: content value changes, array length changes.
 * Info only: new files, new optional fields.
 */

import { parseArgs } from "jsr:@std/cli/parse-args";
import { compareDirectoryContents } from "../comparators/json-comparator.ts";

const args = parseArgs(Deno.args, { string: ["report"], default: { report: "" } });

const BASELINE_DIR = "./tests/release/.baseline-output";
const CANDIDATE_DIR = "./tests/release/.candidate-output";

async function run() {
  console.log("Comparing baseline vs candidate artifacts...");

  const result = await compareDirectoryContents(BASELINE_DIR, CANDIDATE_DIR);

  const errors = result.filter((r) => r.severity === "error");
  const warnings = result.filter((r) => r.severity === "warning");
  const info = result.filter((r) => r.severity === "info");

  console.log(`\nResults: ${errors.length} errors, ${warnings.length} warnings, ${info.length} info`);

  if (errors.length > 0) {
    console.error("\nERRORS (release blocking):");
    for (const e of errors) {
      console.error(`  - ${e.path}: ${e.message}`);
    }
  }

  if (warnings.length > 0) {
    console.warn("\nWARNINGS (review required):");
    for (const w of warnings) {
      console.warn(`  - ${w.path}: ${w.message}`);
    }
  }

  if (args.report) {
    await Deno.writeTextFile(args.report, JSON.stringify({ errors, warnings, info }, null, 2));
    console.log(`\nReport written to ${args.report}`);
  }

  if (errors.length > 0) {
    console.error(`\nFAIL: ${errors.length} release-blocking differences found.`);
    Deno.exit(1);
  }

  console.log("\nPASS: No release-blocking differences.");
}

await run();
