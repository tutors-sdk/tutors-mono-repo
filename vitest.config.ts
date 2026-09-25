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
      thresholds: {
        statements: 55,
        branches: 50,
        functions: 65,
        lines: 55
      }
    }
  },
  resolve: {
    alias: workspaceAliases
  }
});
