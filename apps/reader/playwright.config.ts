import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { AUTH_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from "../../tests/bdd/support/reader-oauth.mjs";

const sessionEnv = {
  PUBLIC_ANON_MODE: "FALSE",
  PUBLIC_SUPABASE_URL: "http://localhost:5178",
  PUBLIC_SUPABASE_ANON_KEY: "fixture-anon-key",
  PRIVATE_AUTH_SECRET: AUTH_SECRET,
  PRIVATE_AUTH_GITHUB_ID: GITHUB_CLIENT_ID,
  PRIVATE_AUTH_GITHUB_SECRET: GITHUB_CLIENT_SECRET
};
const oauthEnv = {
  ...sessionEnv, NODE_ENV: "test",
  NODE_OPTIONS: `--import=${new URL("./tests/e2e/oauth-preload.mjs", import.meta.url).href}`
};

export default defineConfig({
  // Tagged tests prove @ui Rules; authentication.spec.ts also checks the server/browser session boundary.
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html"], ["json", { outputFile: "playwright-report/results.json" }], ["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } }
  ],
  webServer: [
    { command: process.env.TEST_READER_BUILT === "1" ? "node tests/fixtures/reader-session/serve-built.mjs" : "pnpm dev --strictPort", cwd: fileURLToPath(new URL("../..", import.meta.url)), url: "http://localhost:5173/healthz/live", reuseExistingServer: false, env: oauthEnv },
    { command: "node ../../tests/fixtures/reader-session/serve.mjs 5178", url: "http://localhost:5178/rest/v1/ready", reuseExistingServer: false, env: oauthEnv },
    { command: "node ../../tests/fixtures/reader-session/serve.mjs 5179", url: "http://localhost:5179/rest/v1/ready", reuseExistingServer: false,
      env: { ...sessionEnv, NODE_ENV: "production", NODE_OPTIONS: "", PRIVATE_AUTH_SECRET: "a-production-secret-distinct-from-the-test-fixture" } }
  ]
});
