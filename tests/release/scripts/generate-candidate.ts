/**
 * Generates JSON artifacts using the local development CLI.
 * These are compared against the baseline to detect regressions.
 */

const REFERENCE_COURSE = "./tests/release/.reference-course";
const OUTPUT_DIR = "./tests/release/.candidate-output";
const LOCAL_CLI = "./packages/jsr/tutors/src/tutors.ts";

async function run() {
  console.log("Generating candidate artifacts with local CLI...");

  try {
    await Deno.remove(OUTPUT_DIR, { recursive: true });
  } catch {
    // Directory may not exist
  }
  await Deno.mkdir(OUTPUT_DIR, { recursive: true });

  const cmd = new Deno.Command("deno", {
    args: ["run", "-A", LOCAL_CLI, REFERENCE_COURSE, "--output", OUTPUT_DIR]
  });

  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    console.error(`Candidate generation failed: ${stderr}`);
    Deno.exit(1);
  }

  console.log(`Candidate artifacts generated in ${OUTPUT_DIR}`);
}

await run();
