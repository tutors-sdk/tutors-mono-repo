import { describe, it, expect } from "vitest";

describe("Public API Surface — @tutors/tutors-time-lib", () => {
  it("should export expected modules", async () => {
    const module = await import("@tutors/tutors-time-lib");
    expect(Object.keys(module).length).toBeGreaterThan(0);
  });

  it("should maintain stable export names", async () => {
    const module = await import("@tutors/tutors-time-lib");
    const exportNames = Object.keys(module).sort();
    expect(exportNames).toMatchSnapshot();
  });

  it("should export service classes and types", async () => {
    const module = await import("@tutors/tutors-time-lib");
    const classes = Object.entries(module)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key);
    expect(classes).toMatchSnapshot();
  });
});
