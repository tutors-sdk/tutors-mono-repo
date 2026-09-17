import { describe, expect, it } from "vitest";
import { compareSamples, mad, median } from "../../scripts/checks/lib/stats.ts";

describe("timing statistics (runway tier L)", () => {
  it("computes median and scaled MAD", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(mad([10, 10, 10])).toBe(0);
    expect(mad([1, 2, 3, 4, 100])).toBeCloseTo(1.4826, 4);
    expect(() => median([])).toThrow();
  });

  it("treats movement inside the noise band as noise", () => {
    const result = compareSamples([100, 104, 98, 102, 101], [103, 105, 99, 104, 102]);
    expect(result.verdict).toBe("within-noise");
  });

  it("negative fixture: a 30% slower candidate is a regression", () => {
    const result = compareSamples([100, 104, 98, 102, 101], [131, 128, 135, 130, 129]);
    expect(result.verdict).toBe("regression");
    expect(result.delta).toBe(29);
  });

  it("a single outlier run does not make a regression, because medians are compared", () => {
    expect(compareSamples([100, 101, 99], [100, 400, 101]).verdict).toBe("within-noise");
  });

  it("uses the relative floor when the baseline is suspiciously tight", () => {
    // MAD is 0, so without a floor a +1 ms move would count.
    expect(compareSamples([100, 100, 100], [101, 101, 101]).verdict).toBe("within-noise");
    expect(compareSamples([100, 100, 100], [106, 106, 106]).verdict).toBe("regression");
  });

  it("respects higher-is-better metrics such as Lighthouse scores", () => {
    expect(compareSamples([0.95, 0.96, 0.95], [0.8, 0.79, 0.81], { better: "higher", relativeFloor: 0.02 }).verdict).toBe("regression");
    expect(compareSamples([0.8, 0.79, 0.81], [0.95, 0.96, 0.95], { better: "higher", relativeFloor: 0.02 }).verdict).toBe("improvement");
  });

  it("never calls a regression on too few runs", () => {
    expect(compareSamples([100], [500]).verdict).toBe("insufficient-samples");
    expect(compareSamples([100, 100, 100], [500, 500], { minRuns: 3 }).verdict).toBe("insufficient-samples");
  });
});
