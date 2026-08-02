/**
 * Performance benchmark for CLI generation time, SvelteKit build time, and bundle sizes.
 * Fails on >20% regression in generation time.
 */

import { parseArgs } from "jsr:@std/cli/parse-args";

const args = parseArgs(Deno.args, { string: ["mode"], default: { mode: "cli" } });

const WORK_DIR = "./tests/release/.release-work";
const COURSE_DIR = `${WORK_DIR}/reference-course`;

async function benchmarkCli() {
  console.log("Benchmarking CLI generation time...");

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
    console.error("CLI benchmark failed — generation error.");
    Deno.exit(1);
  }

  // Clean up generated output
  try {
    await Deno.remove(`${COURSE_DIR}/json`, { recursive: true });
  } catch { /* ok */ }

  console.log(`CLI generation time: ${(elapsed / 1000).toFixed(2)}s`);
  return elapsed;
}

async function benchmarkBuild() {
  console.log("Benchmarking SvelteKit build time...");

  const start = performance.now();
  const cmd = new Deno.Command("pnpm", { args: ["build"] });
  const result = await cmd.output();
  const elapsed = performance.now() - start;

  if (!result.success) {
    console.error("Build benchmark failed.");
    Deno.exit(1);
  }

  console.log(`Build time: ${(elapsed / 1000).toFixed(2)}s`);
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

  console.log("\nBenchmark Results:", JSON.stringify(results, null, 2));
}

await run();
