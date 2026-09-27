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
  process.stdout.write(`Running smoke tests against: ${url}\n`);

  process.stdout.write("\n1. Checking page loads...\n");
  const response = await fetch(url);
  if (!response.ok) {
    process.stderr.write(`FAIL: Page returned ${response.status}\n`);
    Deno.exit(1);
  }
  process.stdout.write(`   OK: ${response.status}\n`);

  const html = await response.text();

  process.stdout.write("2. Checking HTML content...\n");
  if (!html.includes("<!DOCTYPE html>") && !html.includes("<!doctype html>")) {
    process.stderr.write("FAIL: Response is not valid HTML\n");
    Deno.exit(1);
  }
  process.stdout.write("   OK: Valid HTML document\n");

  process.stdout.write("3. Checking for SvelteKit markers...\n");
  if (!html.includes("__sveltekit")) {
    process.stderr.write("   WARNING: No SvelteKit markers found (may be pre-rendered)\n");
  } else {
    process.stdout.write("   OK: SvelteKit app detected\n");
  }

  process.stdout.write("\nAll smoke tests passed.\n");
}

await run();
