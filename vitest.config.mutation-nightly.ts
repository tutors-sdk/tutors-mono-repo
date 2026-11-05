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
    // Tests that mount a Svelte component need vitest.components.config.ts (Rules 0680, 0681);
    // under this config they cannot resolve @iconify/svelte and crash Stryker's dry run.
    exclude: ["**/node_modules/**", "tests/e2e/**", "tests/release/**", "tests/**/*.component.steps.ts", "tests/**/*.component.test.ts"],
    setupFiles: ["tests/support/no-network.ts"],
  },
  resolve: { alias: workspaceAliases },
});
