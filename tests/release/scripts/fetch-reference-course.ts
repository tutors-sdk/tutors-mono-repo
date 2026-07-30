/**
 * Fetches or updates the tutors-reference-course from GitHub.
 * Used as the golden input for artifact regression testing.
 */

const REPO_URL = "https://github.com/tutors-sdk/tutors-reference-course.git";
const LOCAL_PATH = "./tests/release/.reference-course";

async function run() {
  try {
    const stat = await Deno.stat(LOCAL_PATH);
    if (stat.isDirectory) {
      console.log("Reference course exists, pulling latest...");
      const pull = new Deno.Command("git", { args: ["-C", LOCAL_PATH, "pull", "--ff-only"] });
      const result = await pull.output();
      if (!result.success) {
        console.error("Git pull failed, re-cloning...");
        await Deno.remove(LOCAL_PATH, { recursive: true });
        await clone();
      } else {
        console.log("Reference course updated.");
      }
    }
  } catch {
    await clone();
  }
}

async function clone() {
  console.log(`Cloning reference course from ${REPO_URL}...`);
  const cmd = new Deno.Command("git", { args: ["clone", "--depth=1", REPO_URL, LOCAL_PATH] });
  const result = await cmd.output();
  if (!result.success) {
    console.error("Failed to clone reference course.");
    Deno.exit(1);
  }
  console.log("Reference course cloned.");
}

await run();
