import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { createRequire } from "module";

// Resolve the generator's npm imports by name, as vitest.config.ts does, so
// version bumps don't silently break pinned virtual-store paths.
const require = createRequire(import.meta.url);
const jsYaml = require.resolve("js-yaml");
const frontMatter = require.resolve("front-matter");

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
    alias: {
      "@tutors/tutors-model-lib": resolve(__dirname, "packages/jsr/model/src/tutors.ts"),
      "@tutors/tutors-gen-lib": resolve(__dirname, "packages/jsr/gen/src/tutors.ts"),
      "@tutors/tutors-time-lib": resolve(__dirname, "packages/jsr/time/src/index.ts"),
      "@tutors/community/utils/supabase-client": resolve(
        __dirname,
        "packages/svelte/community/src/utils/supabase-client.ts"
      ),
      "@tutors/logger": resolve(__dirname, "packages/svelte/utils/logger/src/index.ts"),
      "front-matter": frontMatter,
      "js-yaml": jsYaml,
      "npm:js-yaml@^4": jsYaml,
      "npm:archiver@^7": resolve(__dirname, "tests/support/archiver-shim.ts"),
      "@vento/vento": resolve(__dirname, "tests/support/vento-stub.ts"),
      "jsr:@vento/vento@1.14.0/plugins/auto_trim.ts": resolve(__dirname, "tests/support/vento-stub.ts")
    }
  }
});
