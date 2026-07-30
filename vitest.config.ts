import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.steps.ts"],
    exclude: ["tests/e2e/**", "tests/release/**"],
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
      "@tutors/tutors-time-lib": resolve(__dirname, "packages/jsr/time/src/index.ts")
    }
  }
});
