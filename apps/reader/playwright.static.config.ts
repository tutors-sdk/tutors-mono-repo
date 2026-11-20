import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Rule 0773: the static reader (SVELTEKIT_ADAPTER=static, PUBLIC_ANON_MODE=TRUE) beside a built course, each on
// a plain file server, as Tutors Studio serves them. Build first:
//   SVELTEKIT_ADAPTER=static PUBLIC_ANON_MODE=TRUE pnpm --filter tutors-reader... build
// then: pnpm test:e2e:static-reader
const repo = fileURLToPath(new URL("../..", import.meta.url));
export const READER_PORT = 5190;
export const COURSE_PORT = 8190;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "static-reader.spec.ts",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${READER_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: `node tests/fixtures/static-reader/serve.mjs apps/reader/build ${READER_PORT} --fallback 200.html`, cwd: repo, url: `http://127.0.0.1:${READER_PORT}/ready`, reuseExistingServer: false },
    { command: `node tests/fixtures/static-reader/serve.mjs tests/fixtures/tutors-json-history/5.3.0 ${COURSE_PORT} --cors`, cwd: repo, url: `http://127.0.0.1:${COURSE_PORT}/ready`, reuseExistingServer: false }
  ]
});
