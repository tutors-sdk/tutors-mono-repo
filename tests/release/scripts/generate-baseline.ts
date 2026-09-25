/**
 * Generates JSON artifacts using the published production CLI from JSR.
 * These serve as the baseline for artifact regression comparison.
 *
 * The CLI requires course.md in the CWD and outputs to ./json/.
 * We run from the reference course directory, then move output to .release-work/baseline/.
 */

import { parseArgs } from "jsr:@std/cli/parse-args";
import { resolve } from "jsr:@std/path";

const args = parseArgs(Deno.args, {
  string: ["version"],
  default: { version: "latest" },
});

const WORK_DIR = resolve("./tests/release/.release-work");
const COURSE_DIR = resolve(`${WORK_DIR}/reference-course`);
const OUTPUT_DIR = resolve(`${WORK_DIR}/baseline`);

async function run() {
  const version = args.version;
  const jsrPackage = version === "latest"
    ? "jsr:@tutors/tutors"
    : `jsr:@tutors/tutors@${version}`;

  process.stdout.write(`[baseline] Generating with CLI version: ${version}\n`);
  process.stdout.write(`[baseline] Package: ${jsrPackage}\n`);

  // Verify reference course exists
  try {
    await Deno.stat(`${COURSE_DIR}/course.md`);
  } catch {
    process.stderr.write("[baseline] Reference course not found. Run fetch-reference-course.ts first.\n");
    Deno.exit(1);
  }

  // Clean previous baseline
  try {
    await Deno.remove(OUTPUT_DIR, { recursive: true });
  } catch { /* may not exist */ }

  // Clean any leftover json/ in course dir
  const courseJsonDir = `${COURSE_DIR}/json`;
  try {
    await Deno.remove(courseJsonDir, { recursive: true });
  } catch { /* may not exist */ }

  // Run the published CLI from the course directory
  const cmd = new Deno.Command("deno", {
    args: ["run", "-A", jsrPackage],
    cwd: COURSE_DIR,
  });

  process.stdout.write(`[baseline] Running CLI in ${COURSE_DIR}...\n`);
  const result = await cmd.output();

  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    process.stderr.write(`[baseline] Generation failed: ${stderr}\n`);
    Deno.exit(1);
  }

  // Move json/ output to baseline/
  try {
    await Deno.stat(courseJsonDir);
  } catch {
    process.stderr.write("[baseline] No json/ directory produced by CLI.\n");
    Deno.exit(1);
  }

  await Deno.rename(courseJsonDir, OUTPUT_DIR);
  process.stdout.write(`[baseline] Artifacts moved to ${OUTPUT_DIR}\n`);
}

await run();
