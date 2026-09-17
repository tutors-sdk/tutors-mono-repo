import { defineConfig, devices } from "@playwright/test";

/**
 * Journeys against the built container images (runway tier G). Start the stack
 * first; this config never launches `vite dev`:
 *
 *   deno run -A tests/e2e-stack/fixture-course/build.ts
 *   docker compose -f tests/e2e-stack/compose.yaml up -d --wait
 *   pnpm test:e2e:stack                                  # chromium + webkit (PR)
 *   pnpm test:e2e:stack --project firefox --project mobile  # nightly
 *
 * Base URLs come from the environment (see tests/e2e-stack/journeys/stack.ts),
 * so the release harness can run the same journeys against another stack.
 */
export default defineConfig({
  testDir: "./tests/e2e-stack/journeys",
  testMatch: "**/*.journey.spec.ts",
  outputDir: "./test-results/e2e-stack",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: a journey that needs one is flaky, and that is a finding.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/e2e-stack" }]] : [["list"]],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ]
});
