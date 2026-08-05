import { describe, it, expect } from "vitest";

describe("Public API Surface — @tutors/tutors-gen-lib", () => {
  it("should export expected modules", async () => {
    const module = await import("@tutors/tutors-gen-lib");
    expect(Object.keys(module).length).toBeGreaterThan(0);
  });

  it("should maintain stable export names", async () => {
    const module = await import("@tutors/tutors-gen-lib");
    const exportNames = Object.keys(module).sort();
    expect(exportNames).toMatchSnapshot();
  });

  it("should export generation functions", async () => {
    const module = await import("@tutors/tutors-gen-lib");
    const genFunctions = Object.entries(module)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key);
    expect(genFunctions).toMatchSnapshot();
  });
});
