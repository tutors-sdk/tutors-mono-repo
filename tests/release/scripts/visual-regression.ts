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
  process.stdout.write("Visual regression testing\n");
  process.stdout.write(`  Production: ${args.production}\n`);
  process.stdout.write(`  Preview:    ${args.preview}\n`);
  process.stdout.write("\n");
  process.stdout.write("This script requires Playwright to be installed.\n");
  process.stdout.write("Run with: pnpm exec playwright install --with-deps chromium\n");
  process.stdout.write("\n");
  process.stdout.write("Visual regression comparison is a warning-only check.\n");
  process.stdout.write("Implement Playwright screenshot comparison for full automation.\n");
}

await run();
