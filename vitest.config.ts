import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./vitest.aliases";
import coverageFloors from "./tests/suite-health/coverage-floors.json" with { type: "json" };

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.steps.ts"],
    // Fuzz suites use vitest.config.fuzz.ts (threads pool) — see issue #8.
    // Replaces Vitest's default exclude, so node_modules must be listed again (the isolated
    // Lighthouse runner under tests/performance/lighthouse has its own).
    exclude: ["**/node_modules/**", "tests/e2e/**", "tests/release/**", "tests/fuzz/**"],
    // Unit and property tiers never reach the network (runway tier B).
    setupFiles: ["tests/support/no-network.ts"],
    server: {
      deps: {
        // Ships imports of SvelteKit's `$app/*` virtual modules, which only
        // resolve when Vite processes the package rather than externalising it.
        inline: ["@auth/sveltekit"]
      }
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json-summary"],
      reportsDirectory: "./coverage",
      // Measure every source file, not only the ones a test happens to import, so an
      // untested module counts as 0% rather than being invisible (Rule 0110).
      include: ["packages/*/*/src/**/*.ts", "packages/*/*/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.d.ts", "**/.svelte-kit/**", "**/node_modules/**"],
      // Floors live in tests/suite-health/coverage-floors.json and only go up (Rules 0111, 0112).
      thresholds: { ...coverageFloors.global, ...coverageFloors.packages }
    }
  },
  resolve: {
    alias: workspaceAliases
  }
});
