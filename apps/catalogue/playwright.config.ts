import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries (Rule 0620): a test that passes only on a second try is flaky, and that is a finding.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html"], ["json", { outputFile: "playwright-report/results.json" }], ["list"]],
  use: {
    baseURL: "http://localhost:5175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } }
  ],
  webServer: {
    command: "pnpm dev",
    port: 5175,
    reuseExistingServer: !process.env.CI
  }
});
