/**
 * Small, dependency-free statistics for timing comparisons (runway tier L).
 *
 * A single timing is noise; a raw percentage threshold on one run flakes on a
 * shared CI runner. Instead: take several runs per side, compare medians, and
 * only call a regression when the candidate median sits outside a noise band
 * derived from the baseline's own spread (median absolute deviation), with a
 * floor so a suspiciously tight baseline cannot make every run a regression.
 */

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("median of an empty sample");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Median absolute deviation, scaled by 1.4826 so it estimates the standard deviation of normal data. */
export function mad(values: readonly number[]): number {
  const m = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
}

export interface CompareOptions {
  /** Fewer samples than this on either side gives `insufficient-samples`, never a regression. */
  minRuns?: number;
  /** How many MADs the candidate median may move before it counts. */
  k?: number;
  /** Minimum band as a fraction of the baseline median, e.g. 0.05 = 5 %. */
  relativeFloor?: number;
  /** Minimum band in the metric's own unit, e.g. 20 ms. */
  absoluteFloor?: number;
  /** Direction of "better". Timings and sizes are lower-is-better; scores are higher-is-better. */
  better?: "lower" | "higher";
}

export type Verdict = "regression" | "improvement" | "within-noise" | "insufficient-samples";

export interface Comparison {
  verdict: Verdict;
  baselineMedian: number;
  candidateMedian: number;
  band: number;
  delta: number;
}

export function compareSamples(baseline: readonly number[], candidate: readonly number[], options: CompareOptions = {}): Comparison {
  const { minRuns = 3, k = 3, relativeFloor = 0.05, absoluteFloor = 0, better = "lower" } = options;
  const baselineMedian = baseline.length > 0 ? median(baseline) : Number.NaN;
  const candidateMedian = candidate.length > 0 ? median(candidate) : Number.NaN;
  const delta = candidateMedian - baselineMedian;
  if (baseline.length < minRuns || candidate.length < minRuns) {
    return { verdict: "insufficient-samples", baselineMedian, candidateMedian, band: Number.NaN, delta };
  }
  const band = Math.max(k * mad(baseline), relativeFloor * Math.abs(baselineMedian), absoluteFloor);
  const worse = better === "lower" ? delta > band : -delta > band;
  const improved = better === "lower" ? -delta > band : delta > band;
  return { verdict: worse ? "regression" : improved ? "improvement" : "within-noise", baselineMedian, candidateMedian, band, delta };
}
