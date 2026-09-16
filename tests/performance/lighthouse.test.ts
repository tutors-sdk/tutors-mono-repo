import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  CONFIG_FILE,
  collectLighthouseSamples,
  extractRun,
  floorFindings,
  lighthouseBaselineFindings,
  resolvePagePath,
  type LighthouseConfig,
  type LighthouseRun
} from "../../scripts/checks/lighthouse.ts";
import { REPO_ROOT, readText } from "../../scripts/checks/lib/repo.ts";

/** The parts of a Lighthouse result (LHR) the runner reads. */
function lhr(performance: number, lcp: number, extra: Record<string, unknown> = {}) {
  return {
    categories: {
      performance: { score: performance },
      accessibility: { score: 0.95 },
      "best-practices": { score: 1 },
      seo: { score: 0.91 }
    },
    audits: {
      "first-contentful-paint": { numericValue: 950.1234 },
      "largest-contentful-paint": { numericValue: lcp },
      "total-blocking-time": { numericValue: 120 },
      "cumulative-layout-shift": { numericValue: 0.01 },
      "speed-index": { numericValue: 1300 }
    },
    ...extra
  };
}

const FLOORS = { performance: 0.5, accessibility: 0.9, "best-practices": 0.8, seo: 0.8 };

describe("lighthouse (runway tier L)", () => {
  it("extracts scores and lab metrics from a Lighthouse result", () => {
    expect(extractRun(lhr(0.88, 1670.7765))).toEqual({
      scores: { performance: 0.88, accessibility: 0.95, "best-practices": 1, seo: 0.91 },
      metrics: { fcpMs: 950.123, lcpMs: 1670.777, tbtMs: 120, cls: 0.01, speedIndexMs: 1300 },
      runtimeError: undefined
    });
    const failed = extractRun({ ...lhr(0, 0), runtimeError: { code: "ERRORED_DOCUMENT_REQUEST", message: "status 500" } });
    expect(failed.runtimeError).toBe("ERRORED_DOCUMENT_REQUEST: status 500");
  });

  it("passes pages whose median scores meet the floors", () => {
    const runs = { home: [extractRun(lhr(0.9, 1600)), extractRun(lhr(0.4, 5000)), extractRun(lhr(0.92, 1650))] };
    // One bad run (0.40) does not fail the page: the median is 0.90.
    expect(floorFindings(runs, FLOORS)).toEqual([]);
  });

  describe("negative fixtures", () => {
    it("flags a median score below its floor, using the lower median for even run counts", () => {
      const runs = { course: [extractRun(lhr(0.45, 4000)), extractRun(lhr(0.6, 2000))] };
      expect(floorFindings(runs, FLOORS)).toEqual(["below-floor: course: performance 0.45 < 0.50"]);
    });

    it("flags runtime errors and missing categories", () => {
      const errored: LighthouseRun = { scores: {}, metrics: {}, runtimeError: "NO_FCP: page never painted" };
      const partial: LighthouseRun = { scores: { performance: 0.9 }, metrics: {} };
      expect(floorFindings({ lab: [errored, partial] }, FLOORS)).toEqual([
        "runtime-error: lab: NO_FCP: page never painted",
        "missing-score: lab: accessibility",
        "missing-score: lab: best-practices",
        "missing-score: lab: seo"
      ]);
    });

    it("applies a page's own floor only to that page", () => {
      const lowA11y = (perf: number): LighthouseRun => ({ ...extractRun(lhr(perf, 2000)), scores: { ...extractRun(lhr(perf, 2000)).scores, accessibility: 0.88 } });
      const runs = { lab: [lowA11y(0.8)], course: [lowA11y(0.8)] };
      expect(floorFindings(runs, FLOORS, { lab: { accessibility: 0.85 } })).toEqual(["below-floor: course: accessibility 0.88 < 0.90"]);
    });

    it("compares against a baseline: a slower LCP and a lower score are regressions, noise is not", () => {
      const baseline = collectLighthouseSamples({ home: [lhr(0.9, 1600), lhr(0.91, 1650), lhr(0.9, 1620)].map(extractRun) });
      const noisy = collectLighthouseSamples({ home: [lhr(0.89, 1640), lhr(0.9, 1600), lhr(0.91, 1660)].map(extractRun) });
      expect(lighthouseBaselineFindings(baseline, noisy).findings).toEqual([]);

      const slower = collectLighthouseSamples({ home: [lhr(0.7, 2600), lhr(0.72, 2700), lhr(0.69, 2650)].map(extractRun) });
      expect(lighthouseBaselineFindings(baseline, slower).findings).toEqual([
        "lighthouse-regression: home score:performance: median 0.7 vs 0.9: regression",
        "lighthouse-regression: home metric:lcpMs: median 2650 vs 1620: regression"
      ]);
    });
  });

  it("collects samples per page, skipping errored runs", () => {
    const samples = collectLighthouseSamples({
      home: [extractRun(lhr(0.9, 1600)), { scores: {}, metrics: {}, runtimeError: "boom" }]
    });
    expect(samples.home["score:performance"]).toEqual([0.9]);
    expect(samples.home["metric:lcpMs"]).toEqual([1600]);
  });

  it("the committed config has three reference pages, sane floors and resolvable paths", () => {
    const config: LighthouseConfig = JSON.parse(readText(join(REPO_ROOT, CONFIG_FILE)));
    expect(config.pages.map((p) => p.name)).toEqual(["home", "course", "lab"]);
    expect(config.runs).toBeGreaterThanOrEqual(3);
    for (const category of CATEGORIES) expect(config.floors[category]).toBeGreaterThan(0);
    for (const page of config.pages.filter((p) => p.floors)) expect(page.why, `${page.name} overrides a floor without a why`).toBeTruthy();
    expect(resolvePagePath("/lab/{course}/topic-01", "reference-course")).toBe("/lab/reference-course/topic-01");
  });
});
