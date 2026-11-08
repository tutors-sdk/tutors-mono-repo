import { describe, expect, it } from "vitest";
import { trimRuns } from "../../../packages/jsr/course-rules/src/trim.ts";
import { slugify } from "../../../packages/jsr/course-rules/src/mod.ts";

describe("trimRuns", () => {
  it("drops runs of the character at both ends, or only the end", () => {
    expect(trimRuns("--a-b--", "-")).toBe("a-b");
    expect(trimRuns("//a//", "/", false)).toBe("//a");
    expect(trimRuns("----", "-")).toBe("");
    expect(trimRuns("", "-")).toBe("");
    expect(trimRuns("a", "-")).toBe("a");
  });

  it("stays fast on a long run that a backtracking /-+$/ would choke on", () => {
    const hostile = `${"-".repeat(100_000)}x`;
    const started = performance.now();
    expect(slugify(hostile)).toBe("x");
    expect(trimRuns(`${"/".repeat(100_000)}a`, "/", false)).toHaveLength(100_001);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
