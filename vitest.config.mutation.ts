import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./vitest.aliases";

export default defineConfig({
  test: {
    // Vitest 5 clears every mock before each test by default. A vitest-cucumber step is its own
    // test, so a When step's calls must survive into its Then step: keep Vitest 4's behaviour.
    clearMocks: false,
    include: [
      "tests/unit/model/**/*.test.ts",
      "tests/unit/time/**/*.test.ts",
      "tests/unit/gen/**/*.test.ts",
      "tests/unit/markdown/**/*.test.ts",
      "tests/fuzz/calendar-model.fuzz.test.ts",
      "tests/fuzz/lo-tree-construction.fuzz.test.ts",
    ],
    exclude: ["tests/e2e/**", "tests/release/**"],
    // Same seams as the root config: without the workspace aliases the gen tests cannot load
    // Deno `npm:` specifiers, run nothing, and every gen mutant reads as NoCoverage.
    setupFiles: ["tests/support/no-network.ts"],
  },
  resolve: {
    alias: workspaceAliases,
  },
});
