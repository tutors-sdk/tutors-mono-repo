import { defineConfig } from "vitest/config";
import { resolve } from "path";

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
      "front-matter": resolve(__dirname, "node_modules/.pnpm/front-matter@4.0.2/node_modules/front-matter/index.js"),
      "js-yaml": resolve(__dirname, "node_modules/.pnpm/js-yaml@4.3.0/node_modules/js-yaml/index.js"),
      "npm:js-yaml@^4": resolve(__dirname, "node_modules/.pnpm/js-yaml@4.3.0/node_modules/js-yaml/index.js"),
      "npm:archiver@^7": resolve(__dirname, "node_modules/.pnpm/archiver@7.0.1/node_modules/archiver/index.js"),
      "@vento/vento": resolve(__dirname, "tests/support/vento-stub.ts"),
      "jsr:@vento/vento@1.14.0/plugins/auto_trim.ts": resolve(__dirname, "tests/support/vento-stub.ts")
    }
  }
});
