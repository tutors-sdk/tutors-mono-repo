import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./vitest.aliases";

export default defineConfig({
  test: {
    include: [
      "tests/unit/**/*.test.ts",
      "tests/bdd/steps/**/*.steps.ts",
      "tests/contract/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "tests/e2e/**", "tests/release/**"],
    setupFiles: ["tests/support/no-network.ts"],
    server: { deps: { inline: ["@auth/sveltekit"] } },
  },
  resolve: { alias: workspaceAliases },
});
