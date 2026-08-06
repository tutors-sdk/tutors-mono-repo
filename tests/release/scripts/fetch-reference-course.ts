/**
 * Fetches or updates the tutors-reference-course from GitHub.
 * Used as the golden input for artifact regression testing.
 *
 * Output: tests/release/.release-work/reference-course/
 */

const REPO_URL = "https://github.com/tutors-sdk/tutors-reference-course.git";
const WORK_DIR = "./tests/release/.release-work";
const LOCAL_PATH = `${WORK_DIR}/reference-course`;

async function ensureWorkDir() {
  await Deno.mkdir(WORK_DIR, { recursive: true });
}

async function clone() {
  console.log(`[fetch] Cloning reference course from ${REPO_URL}...`);
  const cmd = new Deno.Command("git", {
    args: ["clone", "--depth=1", REPO_URL, LOCAL_PATH],
  });
  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    console.error(`[fetch] Clone failed: ${stderr}`);
    Deno.exit(1);
  }
  console.log("[fetch] Reference course cloned.");
}

async function run() {
  await ensureWorkDir();

  try {
    const stat = await Deno.stat(LOCAL_PATH);
    if (stat.isDirectory) {
      console.log("[fetch] Reference course exists, pulling latest...");
      const pull = new Deno.Command("git", {
        args: ["-C", LOCAL_PATH, "pull", "--ff-only"],
      });
      const result = await pull.output();
      if (!result.success) {
        console.warn("[fetch] Pull failed, re-cloning...");
        await Deno.remove(LOCAL_PATH, { recursive: true });
        await clone();
      } else {
        console.log("[fetch] Reference course updated.");
      }
    }
  } catch {
    await clone();
  }
}

await run();
