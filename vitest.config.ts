import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.steps.ts"],
    exclude: ["tests/e2e/**", "tests/release/**", "tests/fuzz/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 75,
        lines: 90
      }
    }
  },
  resolve: {
    alias: {
      "@tutors/tutors-model-lib": resolve(__dirname, "packages/jsr/model/src/tutors.ts"),
      "@tutors/tutors-gen-lib": resolve(__dirname, "packages/jsr/gen/src/tutors.ts"),
      "@tutors/tutors-time-lib": resolve(__dirname, "packages/jsr/time/src/index.ts"),
      "@tutors/community/utils/supabase-client": resolve(__dirname, "packages/svelte/community/src/utils/supabase-client.ts"),
      "@tutors/logger": resolve(__dirname, "packages/svelte/utils/logger/src/index.ts"),
      "front-matter": resolve(__dirname, "node_modules/.pnpm/front-matter@4.0.2/node_modules/front-matter/index.js"),
      "js-yaml": resolve(__dirname, "node_modules/.pnpm/js-yaml@4.3.0/node_modules/js-yaml/index.js"),
      "npm:js-yaml@^4": resolve(__dirname, "node_modules/.pnpm/js-yaml@4.3.0/node_modules/js-yaml/index.js"),
      "npm:archiver@^7": resolve(__dirname, "tests/support/archiver-shim.ts"),
      "@marp-team/marp-core": resolve(__dirname, "packages/svelte/course/node_modules/@marp-team/marp-core/lib/marp.js"),
      "@vento/vento": resolve(__dirname, "tests/support/vento-stub.ts"),
      "jsr:@vento/vento@1.14.0/plugins/auto_trim.ts": resolve(__dirname, "tests/support/vento-stub.ts")
    }
  }
});
