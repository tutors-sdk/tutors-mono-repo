import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./vitest.aliases";

/**
 * Dedicated fuzz config.
 *
 * fast-check v4 property generation can crash Vitest's default fork workers
 * (see https://github.com/tutors-sdk/tutors-mono-repo/issues/8). Force the
 * threads pool so fuzz suites run reliably in CI and locally.
 */
export default defineConfig({
  test: {
    include: ["tests/fuzz/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    // Unit and property tiers never reach the network (runway tier B).
    setupFiles: ["tests/support/no-network.ts"],
    pool: "threads",
    fileParallelism: false,
    testTimeout: 60_000
  },
  resolve: {
    // Same resolution as the unit tier (vitest.config.ts): property suites load the generator too.
    alias: workspaceAliases
  }
});
