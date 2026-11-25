import { defineConfig, devices } from "@playwright/test";

/**
 * Journeys against the built container images (runway tier G). Start the stack
 * first; this config never launches `vite dev`:
 *
 *   deno run -A tests/e2e-stack/fixture-course/build.ts
 *   docker compose -f tests/e2e-stack/compose.yaml up -d --wait
 *   pnpm test:e2e:stack                                  # chromium + webkit (PR)
 *   pnpm test:e2e:stack --project firefox --project mobile  # nightly
 *   pnpm test:e2e:stack --project signed-in              # signed-in and resilience journeys (PR)
 *
 * Base URLs come from the environment (see tests/e2e-stack/journeys/stack.ts),
 * so the release harness can run the same journeys against another stack.
 */
/** Journeys that sign in or inject a fault: the `signed-in` project runs them, and only it. */
const SIGNED_IN = ["**/signed-in.journey.spec.ts", "**/resilience.journey.spec.ts", "**/authorisation.journey.spec.ts"];

export default defineConfig({
  testDir: "./tests/e2e-stack/journeys",
  testMatch: "**/*.journey.spec.ts",
  outputDir: "./test-results/e2e-stack",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries (Rule 0620): a journey that needs one is flaky, and that is a finding.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/e2e-stack" }]] : [["list"]],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", testIgnore: SIGNED_IN, use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", testIgnore: SIGNED_IN, use: { ...devices["Desktop Safari"] } },
    { name: "firefox", testIgnore: SIGNED_IN, use: { ...devices["Desktop Firefox"] } },
    { name: "mobile", testIgnore: SIGNED_IN, use: { ...devices["Pixel 7"] } },
    // The signed-in and resilience journeys (tests/bdd/features/journeys): one at a time, since they share the
    // stack's persistence stub, in a Chromium that resolves persistence.e2e.test (the data API the apps are given)
    // to the stub's published port.
    {
      name: "signed-in",
      testMatch: SIGNED_IN,
      workers: 1,
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--host-resolver-rules=MAP *.e2e.test 127.0.0.1"] } }
    }
  ]
});
