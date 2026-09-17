import { describe, it, expect } from "vitest";

describe("Public API Surface — @tutors/tutors-model-lib", () => {
  // The first import transforms the whole library on a cold cache, which can
  // exceed the default 5 s when the suite runs in parallel on a busy runner.
  it("should export expected modules", async () => {
    const module = await import("@tutors/tutors-model-lib");
    expect(Object.keys(module).length).toBeGreaterThan(0);
  }, 30_000);

  it("should maintain stable export names", async () => {
    const module = await import("@tutors/tutors-model-lib");
    const exportNames = Object.keys(module).sort();
    expect(exportNames).toMatchSnapshot();
  });

  it("should export type guard functions", async () => {
    const module = await import("@tutors/tutors-model-lib");
    const typeGuards = Object.entries(module)
      .filter(([key, value]) => key.startsWith("is") && typeof value === "function")
      .map(([key]) => key);
    expect(typeGuards).toMatchSnapshot();
  });

  it("should export utility functions", async () => {
    const module = await import("@tutors/tutors-model-lib");
    const utilities = Object.entries(module)
      .filter(([key, value]) => typeof value === "function" && !key.startsWith("is"))
      .map(([key]) => key);
    expect(utilities).toMatchSnapshot();
  });
});
