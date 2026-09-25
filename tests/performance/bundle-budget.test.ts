import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bundleBudgetFindings,
  gzipSize,
  measureClientBundle,
  proposeBudget,
  proposeCeiling,
  readBudgets,
  slackNotes,
  type BundleBudget
} from "../../scripts/checks/bundle-budget.ts";

/** Deterministic, poorly compressible content so gzip sizes are meaningful. */
function noise(bytes: number, seed: number): string {
  let state = seed;
  let out = "";
  while (out.length < bytes) {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    out += state.toString(36);
  }
  return out.slice(0, bytes);
}

describe("bundle budgets (runway tier L)", () => {
  let clientDir: string;

  beforeAll(() => {
    clientDir = mkdtempSync(join(tmpdir(), "tutors-bundle-"));
    const files: Record<string, string> = {
      "_app/immutable/chunks/vendor.Bx12.js": `export const v = "${noise(40_000, 1)}";`,
      "_app/immutable/nodes/0.Cd34.js": `export const n = "${noise(8_000, 2)}";`,
      "_app/immutable/entry/app.Ef56.js": `export const a = "${noise(4_000, 3)}";`,
      "_app/immutable/assets/0.Gh78.css": `.x{content:"${noise(6_000, 4)}"}`,
      "_app/immutable/assets/logo.Ij90.svg": "<svg/>",
      "_app/version.json": '{"version":"1"}'
    };
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(clientDir, path)), { recursive: true });
      writeFileSync(join(clientDir, path), contents);
    }
  });

  afterAll(() => rmSync(clientDir, { recursive: true, force: true }));

  it("measures gzip sizes of JS and CSS under _app/immutable only, largest chunk first", () => {
    const measured = measureClientBundle(clientDir);
    expect(measured.chunks.map((c) => c.file)).toEqual([
      "_app/immutable/chunks/vendor.Bx12.js",
      "_app/immutable/nodes/0.Cd34.js",
      "_app/immutable/assets/0.Gh78.css",
      "_app/immutable/entry/app.Ef56.js"
    ]);
    expect(measured.largestJsChunk?.file).toBe("_app/immutable/chunks/vendor.Bx12.js");
    const jsTotal = measured.chunks.filter((c) => c.file.endsWith(".js")).reduce((t, c) => t + c.gzipBytes, 0);
    expect(measured.jsGzipBytes).toBe(jsTotal);
    expect(measured.cssGzipBytes).toBe(measured.chunks.find((c) => c.file.endsWith(".css"))!.gzipBytes);
    expect(gzipSize("a".repeat(10_000))).toBeLessThan(100);
  });

  it("passes when every measure is within its ceiling", () => {
    const measured = measureClientBundle(clientDir);
    expect(bundleBudgetFindings("reader", measured, proposeBudget(measured, 0.05))).toEqual([]);
  });

  describe("negative fixtures", () => {
    it("names the chunk that pushed the largest-chunk ceiling over", () => {
      const measured = measureClientBundle(clientDir);
      const budget: BundleBudget = { ...proposeBudget(measured, 0.05), largestJsChunkGzipBytes: 1024 };
      const findings = bundleBudgetFindings("reader", measured, budget);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatch(/^over-budget: reader: largest chunk _app\/immutable\/chunks\/vendor\.Bx12\.js [\d.]+ KB gzip > 1\.0 KB$/);
    });

    it("flags total JS and total CSS over their ceilings", () => {
      const measured = measureClientBundle(clientDir);
      const budget: BundleBudget = { ...proposeBudget(measured, 0.05), jsGzipBytes: 2048, cssGzipBytes: 1024 };
      const findings = bundleBudgetFindings("reader", measured, budget);
      expect(findings.map((f) => f.split(" gzip")[0].replace(/[\d.]+ KB$/, "N"))).toEqual([
        "over-budget: reader: total JS N",
        "over-budget: reader: total CSS N"
      ]);
    });

    it("flags an app with no budget and an empty build", () => {
      const measured = measureClientBundle(clientDir);
      expect(bundleBudgetFindings("newapp", measured, undefined)).toEqual([
        "no-budget: newapp: add it to tests/performance/bundle-budgets.json"
      ]);
      const empty = measureClientBundle(join(clientDir, "does-not-exist"));
      expect(bundleBudgetFindings("reader", empty, proposeBudget(measured, 0.05))).toEqual([
        "empty-build: reader: no JS or CSS under _app/immutable"
      ]);
    });
  });

  it("proposes ceilings rounded up to the next KiB and notes loose ones", () => {
    expect(proposeCeiling(10_000, 0.05)).toBe(11_264);
    expect(proposeCeiling(10_240, 0)).toBe(10_240);
    const measured = measureClientBundle(clientDir);
    const loose: BundleBudget = { ...proposeBudget(measured, 0.05), jsGzipBytes: measured.jsGzipBytes * 10 };
    expect(slackNotes("reader", measured, loose, 0.05)).toHaveLength(1);
    expect(slackNotes("reader", measured, proposeBudget(measured, 0.05), 0.05)).toEqual([]);
  });

  it("the committed budgets cover every app with positive ceilings", () => {
    const budgets = readBudgets();
    expect(Object.keys(budgets.apps).sort()).toEqual(["catalogue", "live", "reader", "time"]);
    expect(budgets.headroom).toBeGreaterThan(0);
    expect(budgets.headroom).toBeLessThanOrEqual(0.1);
    for (const budget of Object.values(budgets.apps)) {
      expect(Object.values(budget).every((v) => Number.isInteger(v) && v > 0)).toBe(true);
    }
  });
});
