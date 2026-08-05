import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: [
      "tests/unit/model/search.test.ts",
      "tests/unit/model/lo-utils.test.ts",
      "tests/unit/model/lo-types.test.ts",
      "tests/unit/model/search-mutations.test.ts",
      "tests/unit/model/lo-utils-mutations.test.ts",
      "tests/unit/time/base-calendar-model.test.ts",
      "tests/unit/time/calendar-utils.test.ts",
      "tests/unit/time/time-formatting.test.ts",
      "tests/unit/time/date-range.test.ts",
      "tests/unit/time/aggregation.test.ts",
      "tests/unit/time/edge-cases.test.ts",
      "tests/unit/time/calendar-mutations.test.ts",
      "tests/fuzz/calendar-model.fuzz.test.ts",
      "tests/fuzz/lo-tree-construction.fuzz.test.ts",
    ],
    exclude: ["tests/e2e/**", "tests/release/**"],
  },
  resolve: {
    alias: {
      "@tutors/tutors-model-lib": resolve(__dirname, "packages/jsr/model/src/tutors.ts"),
      "@tutors/tutors-gen-lib": resolve(__dirname, "packages/jsr/gen/src/tutors.ts"),
      "@tutors/tutors-time-lib": resolve(__dirname, "packages/jsr/time/src/index.ts"),
    },
  },
});
