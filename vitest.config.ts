import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./vitest.aliases";

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
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      // Measure every source file, not only the ones a test happens to import, so an
      // untested module counts as 0% rather than being invisible.
      include: ["packages/*/*/src/**/*.ts", "packages/*/*/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.d.ts", "**/.svelte-kit/**", "**/node_modules/**"],
      // Floors are the measured value on 2026-09-26, rounded down. They only go up:
      // raise a floor in the commit that raises its coverage (testing ramp, R-T3).
      thresholds: {
        statements: 55,
        branches: 48,
        functions: 56,
        lines: 56,
        "packages/jsr/model/src/**": { statements: 83, branches: 71, functions: 88, lines: 83 },
        "packages/jsr/time/src/**": { statements: 69, branches: 48, functions: 79, lines: 69 },
        "packages/jsr/gen/src/**": { statements: 52, branches: 46, functions: 59, lines: 52 },
        "packages/svelte/connect/src/**": { statements: 85, branches: 76, functions: 78, lines: 88 },
        "packages/svelte/quiz/src/**": { statements: 97, branches: 97, functions: 100, lines: 98 },
        "packages/svelte/course/src/**": { statements: 50, branches: 33, functions: 55, lines: 50 },
        "packages/svelte/community/src/**": { statements: 63, branches: 51, functions: 75, lines: 71 }
      }
    }
  },
  resolve: {
    alias: workspaceAliases
  }
});
