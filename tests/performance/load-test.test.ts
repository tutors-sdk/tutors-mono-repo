import { describe, expect, it } from "vitest";
import {
  K6_IMAGE,
  baselineFindings,
  collectSamples,
  memoryGrowthFindings,
  parseDockerMemory,
  readK6Summary,
  soakDriftFindings,
  type K6Summary
} from "../../scripts/checks/load-test.ts";
import { readText } from "../../scripts/checks/lib/repo.ts";

const MiB = 2 ** 20;

/** Shape of `k6 run --summary-export` (a crossed threshold is `true`). */
const summary: K6Summary = {
  metrics: {
    http_reqs: { count: 603 },
    http_req_failed: { value: 0.004, passes: 2, fails: 601, thresholds: { "rate<0.01": false } },
    "http_req_duration{page:home}": { "p(95)": 2.21, med: 1.64, thresholds: { "p(95)<500": false } },
    "http_req_duration{page:asset}": { "p(95)": 612.5, med: 1.35, thresholds: { "p(95)<500": true } },
    "http_req_duration{page:course,phase:late}": { "p(95)": 1.87 },
    http_req_duration: { "p(95)": 2.1 },
    dropped_iterations: { count: 0, thresholds: { "count<1": false } }
  }
};

describe("load test helpers (runway tier L)", () => {
  it("reads per-page p95, error rate, request count and crossed thresholds from a k6 summary export", () => {
    expect(readK6Summary(summary)).toEqual({
      p95ByPage: { home: 2.21, asset: 612.5, "course@late": 1.87 },
      errorRate: 0.004,
      requests: 603,
      crossedThresholds: ["http_req_duration{page:asset} p(95)<500"]
    });
  });

  it("parses docker stats memory figures", () => {
    expect(parseDockerMemory("42.5MiB / 7.6GiB")).toBe(42.5 * MiB);
    expect(parseDockerMemory("1.2GiB / 7.6GiB")).toBe(1.2 * 1024 * MiB);
    expect(parseDockerMemory("512kB / 1GB")).toBe(512_000);
    expect(parseDockerMemory("--")).toBeUndefined();
  });

  describe("memory growth", () => {
    const flat = (n: number, level: number) => Array.from({ length: n }, () => level * MiB);

    it("ignores warm-up growth in the first quarter", () => {
      const warmUp = [40, 50, 60, 70, 71, 72].map((m) => m * MiB);
      expect(memoryGrowthFindings([...warmUp, ...flat(18, 72)])).toEqual([]);
    });

    it("negative fixture: flags steady growth after warm-up", () => {
      const leaking = Array.from({ length: 32 }, (_, i) => (60 + i * 3) * MiB);
      expect(memoryGrowthFindings(leaking)).toEqual([
        expect.stringMatching(/^memory-growth: median memory rose \d+% from \d+ MiB to \d+ MiB$/)
      ]);
    });

    it("does not judge runs too short to separate a leak from warm-up", () => {
      expect(memoryGrowthFindings(Array.from({ length: 18 }, (_, i) => (45 + i * 5) * MiB))).toEqual([]);
    });
  });

  it("negative fixture: soak drift flags a page whose late p95 doubled by at least 20 ms", () => {
    expect(soakDriftFindings({ "home@early": 30, "home@late": 90, "asset@early": 2, "asset@late": 5 })).toEqual([
      "soak-drift: home: p95 30.0 ms early -> 90.0 ms late"
    ]);
  });

  it("compares p95 samples against a baseline by median and noise band", () => {
    const baseline = { home: [40, 42, 41], asset: [10, 11, 10] };
    const noisy = collectSamples([
      { p95ByPage: { home: 43, asset: 11 }, errorRate: 0, requests: 1, crossedThresholds: [] },
      { p95ByPage: { home: 41, asset: 10 }, errorRate: 0, requests: 1, crossedThresholds: [] },
      { p95ByPage: { home: 44, asset: 12 }, errorRate: 0, requests: 1, crossedThresholds: [] }
    ]);
    expect(baselineFindings(baseline, noisy).findings).toEqual([]);

    const slower = { home: [70, 72, 69], asset: [10, 11, 10], course: [5, 5, 5] };
    const result = baselineFindings(baseline, slower);
    expect(result.findings).toEqual([expect.stringMatching(/^p95-regression: home: p95 median 70\.0 ms vs 41\.0 ms .*: regression$/)]);
    expect(result.notes).toContain("course: no baseline samples");
  });

  it("the k6 image is pinned by digest and matches the CI reference", () => {
    expect(K6_IMAGE).toMatch(/^grafana\/k6@sha256:[0-9a-f]{64}$/);
    expect(readText("tests/performance/k6/lib/reader-traffic.js")).toContain("discoverAssets");
  });
});
