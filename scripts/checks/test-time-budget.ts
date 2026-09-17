/**
 * Per-file test time budgets (runway tier O). A suite that slowly gets slower
 * gets run less, so every test file has a wall-clock ceiling.
 *
 *   pnpm exec vitest run --reporter=default --reporter=json --outputFile=reports/vitest.json
 *   pnpm check:test-time reports/vitest.json
 *
 * Ceilings live in tests/suite-health/time-budgets.json: a default for every
 * file plus named exceptions. Raising one is a reviewed diff, not a retry.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, readText, toPosix } from "./lib/repo.ts";

export interface TimeBudgets {
  defaultMs: number;
  files: Record<string, number>;
}

interface VitestJsonReport {
  testResults: { name: string; startTime: number; endTime: number }[];
}

export interface FileDuration {
  file: string;
  ms: number;
}

/** Wall-clock duration per test file from a Vitest JSON report, paths repo-relative. */
export function fileDurations(report: VitestJsonReport, root: string = REPO_ROOT): FileDuration[] {
  return report.testResults.map((result) => ({
    file: toPosix(result.name, root),
    ms: Math.round(result.endTime - result.startTime)
  }));
}

export function timeBudgetFindings(durations: FileDuration[], budgets: TimeBudgets): string[] {
  const findings: string[] = [];
  const seen = new Set(durations.map((d) => d.file));
  for (const { file, ms } of durations) {
    const budget = budgets.files[file] ?? budgets.defaultMs;
    if (ms > budget) findings.push(`over-budget: ${file}: ${ms} ms > ${budget} ms`);
  }
  for (const file of Object.keys(budgets.files)) {
    if (!seen.has(file)) findings.push(`stale-budget: ${file} did not run; remove its entry`);
  }
  return findings.sort();
}

function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error("usage: test-time-budget.ts <vitest-json-report>");
    process.exit(2);
  }
  const report: VitestJsonReport = JSON.parse(readText(resolve(reportPath)));
  const budgets: TimeBudgets = JSON.parse(readText(resolve(REPO_ROOT, "tests/suite-health/time-budgets.json")));
  const durations = fileDurations(report);
  const findings = timeBudgetFindings(durations, budgets);
  const slowest = [...durations].sort((a, b) => b.ms - a.ms).slice(0, 5);
  console.log("slowest files:");
  for (const { file, ms } of slowest) console.log(`  ${String(ms).padStart(6)} ms  ${file}`);
  for (const finding of findings) console.log(finding);
  if (findings.length > 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
