/**
 * Release test orchestrator.
 * Runs the full regression pipeline: fetch → generate → compare.
 *
 * Usage:
 *   deno run -A tests/release/scripts/run-release-tests.ts --mode=cli
 *   deno run -A tests/release/scripts/run-release-tests.ts --mode=reader
 *   deno run -A tests/release/scripts/run-release-tests.ts --mode=all
 */

import { parseArgs } from "jsr:@std/cli/parse-args";

const args = parseArgs(Deno.args, {
  string: ["mode", "version"],
  default: { mode: "all", version: "latest" },
});

const mode = args.mode as "cli" | "reader" | "all";

interface StepResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: StepResult[] = [];

async function runStep(name: string, script: string, extraArgs: string[] = []): Promise<boolean> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"═".repeat(60)}\n`);

  const start = performance.now();
  const cmd = new Deno.Command("deno", {
    args: ["run", "-A", script, ...extraArgs],
    stdout: "inherit",
    stderr: "inherit",
  });

  const result = await cmd.output();
  const duration = performance.now() - start;

  const passed = result.success;
  results.push({
    name,
    passed,
    duration,
    error: passed ? undefined : `Exit code: ${result.code}`,
  });

  if (!passed) {
    console.error(`\n✗ ${name} FAILED (${(duration / 1000).toFixed(1)}s)`);
  } else {
    console.log(`\n✓ ${name} passed (${(duration / 1000).toFixed(1)}s)`);
  }

  return passed;
}

async function runCli(): Promise<boolean> {
  const fetchOk = await runStep(
    "Fetch Reference Course",
    "tests/release/scripts/fetch-reference-course.ts"
  );
  if (!fetchOk) return false;

  const baselineOk = await runStep(
    "Generate Baseline (published CLI)",
    "tests/release/scripts/generate-baseline.ts",
    [`--version=${args.version}`]
  );
  if (!baselineOk) return false;

  const candidateOk = await runStep(
    "Generate Candidate (local CLI)",
    "tests/release/scripts/generate-candidate.ts"
  );
  if (!candidateOk) return false;

  const compareOk = await runStep(
    "Compare CLI Artifacts",
    "tests/release/scripts/compare-artifacts.ts"
  );

  return compareOk;
}

async function runReader(): Promise<boolean> {
  const compareOk = await runStep(
    "Compare Reader Builds",
    "tests/release/scripts/compare-reader-builds.ts"
  );
  return compareOk;
}

async function run() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║          Tutors Release Regression Tests             ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\n  Mode:    ${mode}`);
  console.log(`  Version: ${args.version}\n`);

  let allPassed = true;

  if (mode === "cli" || mode === "all") {
    const cliPassed = await runCli();
    if (!cliPassed) allPassed = false;
  }

  if (mode === "reader" || mode === "all") {
    const readerPassed = await runReader();
    if (!readerPassed) allPassed = false;
  }

  // Print summary table
  console.log(`\n${"═".repeat(60)}`);
  console.log("  SUMMARY");
  console.log(`${"═".repeat(60)}`);
  console.log(`\n  ${"Step".padEnd(40)} ${"Status".padEnd(10)} Duration`);
  console.log(`  ${"─".repeat(40)} ${"─".repeat(10)} ${"─".repeat(8)}`);

  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    const duration = `${(r.duration / 1000).toFixed(1)}s`;
    console.log(`  ${r.name.padEnd(40)} ${status.padEnd(10)} ${duration}`);
  }

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\n  Total: ${(totalDuration / 1000).toFixed(1)}s`);

  if (allPassed) {
    console.log("\n  RESULT: ALL PASSED");
  } else {
    console.error("\n  RESULT: FAILED");
    const failures = results.filter((r) => !r.passed);
    for (const f of failures) {
      console.error(`    ✗ ${f.name}: ${f.error}`);
    }
  }

  console.log("");
  Deno.exit(allPassed ? 0 : 1);
}

await run();
