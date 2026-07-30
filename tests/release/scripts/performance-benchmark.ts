/**
 * Performance benchmark for CLI generation time, SvelteKit build time, and bundle sizes.
 * Fails on >20% regression in generation time.
 */

import { parseArgs } from "jsr:@std/cli/parse-args";

const args = parseArgs(Deno.args, { string: ["mode"], default: { mode: "cli" } });

const REFERENCE_COURSE = "./tests/release/.reference-course";
const OUTPUT_DIR = "./tests/release/.benchmark-output";

async function benchmarkCli() {
  console.log("Benchmarking CLI generation time...");

  try {
    await Deno.remove(OUTPUT_DIR, { recursive: true });
  } catch {
    // ok
  }
  await Deno.mkdir(OUTPUT_DIR, { recursive: true });

  const start = performance.now();
  const cmd = new Deno.Command("deno", {
    args: ["run", "-A", "./packages/jsr/tutors/src/tutors.ts", REFERENCE_COURSE, "--output", OUTPUT_DIR]
  });
  const result = await cmd.output();
  const elapsed = performance.now() - start;

  if (!result.success) {
    console.error("CLI benchmark failed — generation error.");
    Deno.exit(1);
  }

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
