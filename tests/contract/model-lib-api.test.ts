import { describe, it, expect } from "vitest";

describe("Public API Surface — @tutors/tutors-model-lib", () => {
  it("should export expected modules", async () => {
    const module = await import("@tutors/tutors-model-lib");
    expect(Object.keys(module).length).toBeGreaterThan(0);
  });

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
