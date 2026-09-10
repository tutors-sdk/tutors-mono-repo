import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { createRequire } from "module";

// packages/jsr/gen is a Deno package, so its `js-yaml` / `front-matter` imports
// have no node_modules of their own to resolve against. Resolve them from the
// workspace root by name rather than by pnpm virtual-store path, so version
// bumps don't silently break the aliases.
const require = createRequire(import.meta.url);
const jsYaml = require.resolve("js-yaml");
const frontMatter = require.resolve("front-matter");

// The workspace root and packages/svelte/community resolve @supabase/supabase-js to
// different copies, so a `vi.mock` written in a test would not be the module the code
// under test imported. One alias makes both the same module.
const supabase = require.resolve("@supabase/supabase-js", { paths: [resolve(__dirname, "packages/svelte/community")] });

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.steps.ts"],
    // Fuzz suites use vitest.config.fuzz.ts (threads pool) — see issue #8.
    exclude: ["tests/e2e/**", "tests/release/**", "tests/fuzz/**"],
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
    alias: {
      "@tutors/tutors-model-lib": resolve(__dirname, "packages/jsr/model/src/tutors.ts"),
      "@tutors/tutors-gen-lib": resolve(__dirname, "packages/jsr/gen/src/tutors.ts"),
      "@tutors/tutors-time-lib": resolve(__dirname, "packages/jsr/time/src/index.ts"),
      "@tutors/community/utils/supabase-client": resolve(__dirname, "packages/svelte/community/src/utils/supabase-client.ts"),
      "@supabase/supabase-js": supabase,
      "@tutors/logger": resolve(__dirname, "packages/svelte/utils/logger/src/index.ts"),
      "front-matter": frontMatter,
      "js-yaml": jsYaml,
      "npm:js-yaml@^4": jsYaml,
      "npm:archiver@^7": resolve(__dirname, "tests/support/archiver-shim.ts"),
      "@marp-team/marp-core": resolve(__dirname, "packages/svelte/course/node_modules/@marp-team/marp-core/lib/marp.js"),
      "@vento/vento": resolve(__dirname, "tests/support/vento-stub.ts"),
      "jsr:@vento/vento@1.14.0/plugins/auto_trim.ts": resolve(__dirname, "tests/support/vento-stub.ts")
    }
  }
});
