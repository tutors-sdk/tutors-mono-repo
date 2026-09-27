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
  process.stdout.write(`\n${"═".repeat(60)}\n`);
  process.stdout.write(`  ${name}\n`);
  process.stdout.write(`${"═".repeat(60)}\n\n`);

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
    process.stderr.write(`\n✗ ${name} FAILED (${(duration / 1000).toFixed(1)}s)\n`);
  } else {
    process.stdout.write(`\n✓ ${name} passed (${(duration / 1000).toFixed(1)}s)\n`);
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
  process.stdout.write("╔══════════════════════════════════════════════════════╗\n");
  process.stdout.write("║          Tutors Release Regression Tests             ║\n");
  process.stdout.write("╚══════════════════════════════════════════════════════╝\n");
  process.stdout.write(`\n  Mode:    ${mode}\n`);
  process.stdout.write(`  Version: ${args.version}\n\n`);

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
  process.stdout.write(`\n${"═".repeat(60)}\n`);
  process.stdout.write("  SUMMARY\n");
  process.stdout.write(`${"═".repeat(60)}\n`);
  process.stdout.write(`\n  ${"Step".padEnd(40)} ${"Status".padEnd(10)} Duration\n`);
  process.stdout.write(`  ${"─".repeat(40)} ${"─".repeat(10)} ${"─".repeat(8)}\n`);

  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    const duration = `${(r.duration / 1000).toFixed(1)}s`;
    process.stdout.write(`  ${r.name.padEnd(40)} ${status.padEnd(10)} ${duration}\n`);
  }

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  process.stdout.write(`\n  Total: ${(totalDuration / 1000).toFixed(1)}s\n`);

  if (allPassed) {
    process.stdout.write("\n  RESULT: ALL PASSED\n");
  } else {
    process.stderr.write("\n  RESULT: FAILED\n");
    const failures = results.filter((r) => !r.passed);
    for (const f of failures) {
      process.stderr.write(`    ✗ ${f.name}: ${f.error}\n`);
    }
  }

  process.stdout.write("\n");
  Deno.exit(allPassed ? 0 : 1);
}

await run();
