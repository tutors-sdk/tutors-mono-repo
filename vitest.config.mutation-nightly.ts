import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./vitest.aliases";

export default defineConfig({
  test: {
    // Vitest 5 clears every mock before each test by default. A vitest-cucumber step is its own
    // test, so a When step's calls must survive into its Then step: keep Vitest 4's behaviour.
    clearMocks: false,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/bdd/steps/**/*.steps.ts",
      "tests/contract/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "tests/e2e/**", "tests/release/**"],
    setupFiles: ["tests/support/no-network.ts"],
  },
  resolve: { alias: workspaceAliases },
});
