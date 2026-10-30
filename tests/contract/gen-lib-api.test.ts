import { describe, it, expect } from "vitest";

describe("Public API Surface — @tutors/tutors-gen-lib", () => {
  // The first import transforms the whole generator on a cold cache, which can
  // exceed the default 5 s when the suite runs in parallel on a CI runner.
  it("should export expected modules", async () => {
    const module = await import("../../packages/jsr/gen/src/tutors.ts");
    expect(Object.keys(module).length).toBeGreaterThan(0);
  }, 30_000);

  it("should maintain stable export names", async () => {
    const module = await import("../../packages/jsr/gen/src/tutors.ts");
    const exportNames = Object.keys(module).sort();
    expect(exportNames).toMatchSnapshot();
  });

  it("should export generation functions", async () => {
    const module = await import("../../packages/jsr/gen/src/tutors.ts");
    const genFunctions = Object.entries(module)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key);
    expect(genFunctions).toMatchSnapshot();
  });
});
