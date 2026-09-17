import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fileDurations, timeBudgetFindings, type TimeBudgets } from "../../scripts/checks/test-time-budget.ts";
import { REPO_ROOT, readText } from "../../scripts/checks/lib/repo.ts";

const budgets: TimeBudgets = { defaultMs: 1000, files: { "tests/slow.test.ts": 5000 } };

describe("per-file test time budgets (runway tier O)", () => {
  it("reads wall-clock durations from a Vitest JSON report", () => {
    const report = { testResults: [{ name: resolve(REPO_ROOT, "tests/a.test.ts"), startTime: 100, endTime: 350.4 }] };
    expect(fileDurations(report)).toEqual([{ file: "tests/a.test.ts", ms: 250 }]);
  });

  it("accepts files within the default and within a named exception", () => {
    expect(
      timeBudgetFindings(
        [
          { file: "tests/a.test.ts", ms: 999 },
          { file: "tests/slow.test.ts", ms: 4000 }
        ],
        budgets
      )
    ).toEqual([]);
  });

  it("negative fixtures: flags a file over its budget and an exception for a file that no longer runs", () => {
    expect(
      timeBudgetFindings(
        [
          { file: "tests/a.test.ts", ms: 1500 },
          { file: "tests/b.test.ts", ms: 10 }
        ],
        budgets
      )
    ).toEqual([
      "over-budget: tests/a.test.ts: 1500 ms > 1000 ms",
      "stale-budget: tests/slow.test.ts did not run; remove its entry"
    ]);
  });

  it("the committed budgets file is well formed and names existing files", () => {
    const committed: TimeBudgets = JSON.parse(readText(resolve(REPO_ROOT, "tests/suite-health/time-budgets.json")));
    expect(committed.defaultMs).toBeGreaterThan(0);
    for (const [file, ms] of Object.entries(committed.files)) {
      expect(() => readText(resolve(REPO_ROOT, file)), file).not.toThrow();
      expect(ms).toBeGreaterThan(committed.defaultMs);
    }
  });
});
