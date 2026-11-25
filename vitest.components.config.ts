import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./vitest.aliases";

// Tests that mount a Svelte component (Rules 0680, 0681). The root vitest.config.ts runs this as its
// "components" project, so `pnpm test` collects these files too. It differs from the node project in
// three ways: the Svelte plugin compiles .svelte files, Svelte resolves to its browser build, and
// the DOM is happy-dom.
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: workspaceAliases,
    conditions: ["browser"]
  },
  test: {
    name: "components",
    // Same as the root config: a vitest-cucumber When step's mock calls must survive into its Then step.
    clearMocks: false,
    include: ["tests/**/*.component.steps.ts", "tests/**/*.component.test.ts"],
    exclude: ["**/node_modules/**"],
    setupFiles: ["tests/support/no-network.ts"],
    environment: "happy-dom",
    // These libraries ship .svelte sources, which Node cannot load: bundle them so the plugin compiles them.
    server: { deps: { inline: [/@skeletonlabs\/skeleton-svelte/, /@zag-js\/svelte/, /@iconify\/svelte/] } }
  }
});
