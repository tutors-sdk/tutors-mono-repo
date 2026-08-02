/**
 * Critical path smoke tests against a deployed preview URL.
 * Validates that the deployed app loads and renders core content.
 */

import { parseArgs } from "jsr:@std/cli/parse-args";

const args = parseArgs(Deno.args, {
  string: ["url"],
  default: { url: "https://tutors.dev/course/deploy-preview-2--reference-course" }
});

async function run() {
  const url = args.url;
  console.log(`Running smoke tests against: ${url}`);

  console.log("\n1. Checking page loads...");
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`FAIL: Page returned ${response.status}`);
    Deno.exit(1);
  }
  console.log(`   OK: ${response.status}`);

  const html = await response.text();

  console.log("2. Checking HTML content...");
  if (!html.includes("<!DOCTYPE html>") && !html.includes("<!doctype html>")) {
    console.error("FAIL: Response is not valid HTML");
    Deno.exit(1);
  }
  console.log("   OK: Valid HTML document");

  console.log("3. Checking for SvelteKit markers...");
  if (!html.includes("__sveltekit")) {
    console.warn("   WARNING: No SvelteKit markers found (may be pre-rendered)");
  } else {
    console.log("   OK: SvelteKit app detected");
  }

  console.log("\nAll smoke tests passed.");
}

await run();
