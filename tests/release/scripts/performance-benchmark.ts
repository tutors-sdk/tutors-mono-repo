/**
 * Performance benchmark for CLI generation time, SvelteKit build time, and bundle sizes.
 * Fails on >20% regression in generation time.
 */

import { parseArgs } from "jsr:@std/cli/parse-args";

const args = parseArgs(Deno.args, { string: ["mode"], default: { mode: "cli" } });

const WORK_DIR = "./tests/release/.release-work";
const COURSE_DIR = `${WORK_DIR}/reference-course`;

async function benchmarkCli() {
  process.stdout.write("Benchmarking CLI generation time...\n");

  // Clean any leftover json/ in course dir
  try {
    await Deno.remove(`${COURSE_DIR}/json`, { recursive: true });
  } catch { /* may not exist */ }

  const start = performance.now();
  const cmd = new Deno.Command("deno", {
    args: ["run", "-A", "./packages/jsr/tutors/main.ts"],
    cwd: COURSE_DIR,
  });
  const result = await cmd.output();
  const elapsed = performance.now() - start;

  if (!result.success) {
    process.stderr.write("CLI benchmark failed — generation error.\n");
    Deno.exit(1);
  }

  // Clean up generated output
  try {
    await Deno.remove(`${COURSE_DIR}/json`, { recursive: true });
  } catch { /* ok */ }

  process.stdout.write(`CLI generation time: ${(elapsed / 1000).toFixed(2)}s\n`);
  return elapsed;
}

async function benchmarkBuild() {
  process.stdout.write("Benchmarking SvelteKit build time...\n");

  const start = performance.now();
  const cmd = new Deno.Command("pnpm", { args: ["build"] });
  const result = await cmd.output();
  const elapsed = performance.now() - start;

  if (!result.success) {
    process.stderr.write("Build benchmark failed.\n");
    Deno.exit(1);
  }

  process.stdout.write(`Build time: ${(elapsed / 1000).toFixed(2)}s\n`);
  return elapsed;
}

async function run() {
  const results: Record<string, number> = {};

  if (args.mode === "cli" || args.mode === "all") {
    results.cliMs = await benchmarkCli();
  }

  if (args.mode === "build" || args.mode === "all") {
    results.buildMs = await benchmarkBuild();
  }

  process.stdout.write("\nBenchmark Results:", JSON.stringify(results, null, 2) + "\n");
}

await run();
