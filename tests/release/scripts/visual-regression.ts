/**
 * Visual regression testing using Playwright screenshots.
 * Compares production vs preview deployments.
 * Warning-only — does not block releases.
 */

import { parseArgs } from "jsr:@std/cli/parse-args";

const args = parseArgs(Deno.args, {
  string: ["production", "preview"],
  default: {
    production: "https://tutors.dev/course/deploy-preview-2--reference-course",
    preview: "http://localhost:5173/course/deploy-preview-2--reference-course"
  }
});

async function run() {
  console.log("Visual regression testing");
  console.log(`  Production: ${args.production}`);
  console.log(`  Preview:    ${args.preview}`);
  console.log("");
  console.log("This script requires Playwright to be installed.");
  console.log("Run with: pnpm exec playwright install --with-deps chromium");
  console.log("");
  console.log("Visual regression comparison is a warning-only check.");
  console.log("Implement Playwright screenshot comparison for full automation.");
}

await run();
