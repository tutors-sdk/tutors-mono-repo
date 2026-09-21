/**
 * Generates JSON artifacts using the local development CLI.
 * These are compared against the baseline to detect regressions.
 *
 * Uses packages/jsr/tutors/main.ts (the actual CLI entry point).
 */

import { resolve } from "jsr:@std/path";

const REPO_ROOT = resolve(".");
const WORK_DIR = resolve("./tests/release/.release-work");
const COURSE_DIR = resolve(`${WORK_DIR}/reference-course`);
const OUTPUT_DIR = resolve(`${WORK_DIR}/candidate`);
const LOCAL_CLI = resolve(`${REPO_ROOT}/packages/jsr/tutors/main.ts`);

async function run() {
  process.stdout.write("[candidate] Generating with local CLI...\n");
  process.stdout.write(`[candidate] CLI: ${LOCAL_CLI}\n`);

  // Verify reference course exists
  try {
    await Deno.stat(`${COURSE_DIR}/course.md`);
  } catch {
    process.stderr.write("[candidate] Reference course not found. Run fetch-reference-course.ts first.\n");
    Deno.exit(1);
  }

  // Verify local CLI exists
  try {
    await Deno.stat(LOCAL_CLI);
  } catch {
    process.stderr.write(`[candidate] Local CLI not found at ${LOCAL_CLI}\n`);
    Deno.exit(1);
  }

  // Clean previous candidate
  try {
    await Deno.remove(OUTPUT_DIR, { recursive: true });
  } catch { /* may not exist */ }

  // Clean any leftover json/ in course dir
  const courseJsonDir = `${COURSE_DIR}/json`;
  try {
    await Deno.remove(courseJsonDir, { recursive: true });
  } catch { /* may not exist */ }

  // Run the local CLI from the course directory
  const cmd = new Deno.Command("deno", {
    args: ["run", "-A", LOCAL_CLI],
    cwd: COURSE_DIR,
  });

  process.stdout.write(`[candidate] Running local CLI in ${COURSE_DIR}...\n`);
  const result = await cmd.output();

  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    process.stderr.write(`[candidate] Generation failed: ${stderr}\n`);
    Deno.exit(1);
  }

  // Move json/ output to candidate/
  try {
    await Deno.stat(courseJsonDir);
  } catch {
    process.stderr.write("[candidate] No json/ directory produced by CLI.\n");
    Deno.exit(1);
  }

  await Deno.rename(courseJsonDir, OUTPUT_DIR);
  process.stdout.write(`[candidate] Artifacts moved to ${OUTPUT_DIR}\n`);
}

await run();
