/**
 * Generates JSON artifacts using the published production CLI from JSR.
 * These serve as the baseline for artifact regression comparison.
 */

import { parseArgs } from "jsr:@std/cli/parse-args";

const args = parseArgs(Deno.args, { string: ["version"], default: { version: "latest" } });
const version = args.version;

const REFERENCE_COURSE = "./tests/release/.reference-course";
const OUTPUT_DIR = "./tests/release/.baseline-output";

async function run() {
  console.log(`Generating baseline artifacts with CLI version: ${version}`);

  try {
    await Deno.remove(OUTPUT_DIR, { recursive: true });
  } catch {
    // Directory may not exist
  }
  await Deno.mkdir(OUTPUT_DIR, { recursive: true });

  const jsr_package = version === "latest" ? "@tutors/tutors" : `@tutors/tutors@${version}`;

  const cmd = new Deno.Command("deno", {
    args: ["run", "-A", `jsr:${jsr_package}`, REFERENCE_COURSE, "--output", OUTPUT_DIR]
  });

  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    console.error(`Baseline generation failed: ${stderr}`);
    Deno.exit(1);
  }

  console.log(`Baseline artifacts generated in ${OUTPUT_DIR}`);
}

await run();
