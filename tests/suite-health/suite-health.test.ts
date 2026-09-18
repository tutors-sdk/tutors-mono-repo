import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverDenoRunners,
  formatSuiteFinding,
  globToRegExp,
  lintFeatureFiles,
  lintTestSource,
  lintTestSuite,
  lintUncollectedTests,
  readRunner
} from "../../scripts/checks/suite-health.ts";
import { describeRatchet, ratchet } from "../../scripts/checks/lib/ratchet.ts";
import { REPO_ROOT, readBaseline, readText } from "../../scripts/checks/lib/repo.ts";

const BASELINE = "tests/suite-health/known-findings.txt";
const TODAY = new Date("2026-09-16T12:00:00Z");

const kinds = (source: string) => lintTestSource("fixture.test.ts", source, TODAY).map((f) => `${f.kind}: ${f.title}`);

describe("suite health (runway tier O)", () => {
  describe("negative fixtures", () => {
    it("flags .only on tests and blocks, including Playwright's test.describe.only", () => {
      expect(
        kinds(`
          it.only("focused", () => { expect(1).toBe(1); });
          describe.only("focused block", () => {});
          test.describe.only("focused playwright block", () => {});
        `)
      ).toEqual(["only: focused", "only: focused block", "only: focused playwright block"]);
    });

    it("flags skipped, todo and fixme tests that carry no quarantine", () => {
      expect(
        kinds(`
          it.skip("skipped", () => { expect(1).toBe(1); });
          it.todo("later");
          describe.skip("skipped block", () => {});
          test.fixme("broken in webkit", async () => { await expect(1).toBe(1); });
        `)
      ).toEqual(["skip: skipped", "skip: later", "skip: skipped block", "skip: broken in webkit"]);
    });

    it("accepts a dated quarantine with an issue, and flags it once expired or malformed", () => {
      expect(
        kinds(`
          // quarantine: #123 until 2026-10-01
          it.skip("still quarantined", () => {});
          // quarantine: #124 until 2026-09-01
          it.skip("quarantine expired", () => {});
          // quarantine: flaky, will fix
          it.skip("no issue or date", () => {});
        `)
      ).toEqual(["quarantine-expired: quarantine expired", "quarantine-malformed: no issue or date"]);
    });

    it("flags tests with no assertion, including it.each tables", () => {
      expect(
        kinds(`
          it("logs but asserts nothing", () => { console.log("hi"); });
          it.each([1, 2])("case %i asserts nothing", (n) => { void n; });
          test("playwright journey asserts nothing", async ({ page }) => { await page.goto("/"); });
        `)
      ).toEqual([
        "no-assertion: logs but asserts nothing",
        "no-assertion: case %i asserts nothing",
        "no-assertion: playwright journey asserts nothing"
      ]);
    });

    it("does not flag hooks, assertions through expect, assert, fast-check or named helpers", () => {
      expect(
        kinds(`
          test.beforeEach(async ({ page }) => { await page.goto("/"); });
          it("expects", () => { expect(1).toBe(1); });
          it("playwright expects", async ({ page }) => { await expect(page).toHaveTitle("x"); });
          it("asserts", () => { assert.equal(1, 1); });
          it("property", () => { fc.assert(fc.property(fc.nat(), (n) => n >= 0)); });
          it("helper", () => { expectValidCourse(course); });
          it("verifier", () => { verifyTree(tree); });
          it("throws", () => { expect(() => boom()).toThrow(); });
        `)
      ).toEqual([]);
    });

    it("classifies feature files: executable, documentation-only, and scenario-free", () => {
      const root = resolve(__dirname, "fixtures/features-root");
      expect(lintFeatureFiles(root)).toEqual([
        { kind: "documentation-only", file: "docs/prose.feature" },
        { kind: "no-scenarios", file: "features/empty.feature" }
      ]);
    });

    it("flags test files no runner collects: outside include, excluded, unmatched by testMatch, no deno test step", () => {
      expect(lintUncollectedTests(resolve(__dirname, "fixtures/runners-root"))).toEqual([
        "uncollected: apps/web/e2e/unmatched.spec.ts",
        "uncollected: packages/cli/bench/orphan.test.js",
        "uncollected: packages/lib/src/__tests__/orphan.spec.ts",
        "uncollected: tests/e2e/excluded.spec.ts"
      ]);
    });

    it("reads a workflow's deno test step as a runner, and ignores a commented-out one", () => {
      const runners = discoverDenoRunners(resolve(__dirname, "fixtures/runners-root"));
      expect(runners.map((r) => r.config)).toEqual([".github/workflows/ci.yml"]);
      expect(runners[0].include.some((p) => p.test("packages/cli/test/run.test.js"))).toBe(true);
      expect(runners[0].include.some((p) => p.test("packages/cli/bench/orphan.test.js"))).toBe(false);
    });

    it("refuses a runner config whose include it cannot read statically", () => {
      const config = "tests/suite-health/fixtures/runner-unreadable/vitest.config.ts";
      expect(() => readRunner(config, readText(join(REPO_ROOT, config)))).toThrow("include is not a string literal");
    });

    it("matches cucumber path globs", () => {
      expect(globToRegExp("features/**/*.feature").test("features/0001-course.feature")).toBe(true);
      expect(globToRegExp("features/**/*.feature").test("features/student/0002-search.feature")).toBe(true);
      expect(globToRegExp("./features/*.feature").test("features/student/0002-search.feature")).toBe(false);
      expect(globToRegExp("features/*.feature").test("tests/bdd/features/x.feature")).toBe(false);
    });
  });

  it("the repo adds no findings beyond the baseline, and the baseline has no stale entries", () => {
    const current = [
      ...lintTestSuite(REPO_ROOT).map(formatSuiteFinding),
      ...lintFeatureFiles(REPO_ROOT).map((f) => `${f.kind}: ${f.file}`),
      ...lintUncollectedTests(REPO_ROOT)
    ];
    // `.only` is never baselined: it silently disables the rest of the suite.
    expect(current.filter((line) => line.startsWith("only:"))).toEqual([]);
    const result = ratchet(current, readBaseline(resolve(REPO_ROOT, BASELINE)));
    expect(result, describeRatchet("suite health", BASELINE, result)).toEqual({ added: [], stale: [] });
  });
});
