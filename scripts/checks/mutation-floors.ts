/**
 * Mutation score floors (Rule 0114). Stryker's break threshold guards the score
 * across every module at once, so one strong module can hide a weak one. This
 * check holds each mutated module to its own floor and, like the coverage
 * floors, fails once a score rises `staleMargin` points above its floor until
 * the floor is raised.
 *
 *   pnpm test:mutation --reporters clear-text,json     # writes reports/mutation/mutation.json
 *   pnpm check:mutation-floors                         # below-floor, stale-floor, unfloored findings
 *   pnpm check:mutation-floors --update                # raise floors to the measured scores
 *
 * Floors live in tests/mutation/mutation-floors.json. The nightly comprehensive run
 * (Rules 0116 to 0119) mutates every library source file and keeps its own floors:
 *
 *   pnpm test:mutation:nightly                          # writes reports/mutation-nightly/mutation.json
 *   pnpm check:mutation-floors reports/mutation-nightly/mutation.json \
 *     --floors tests/mutation/nightly-mutation-floors.json --stale warn --summary "$GITHUB_STEP_SUMMARY"
 *
 * `--stale warn` reports a floor to raise without failing (Rule 0119); `--summary` appends a
 * markdown table of the findings and the weakest modules to the given file.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, readText, toPosix } from "./lib/repo.ts";

export interface MutationFloors {
  staleMargin: number;
  files: Record<string, number>;
}

/** The parts of Stryker's JSON report (mutation-testing-report-schema) this check reads. */
export interface MutationReport {
  files: Record<string, { mutants: { status: string }[] }>;
}

const DETECTED = new Set(["Killed", "Timeout"]);
const UNDETECTED = new Set(["Survived", "NoCoverage"]);

/** Stryker's mutation score: detected over detected plus undetected. Errors and ignored mutants do not count. */
export function mutationScore(statuses: string[]): number {
  const detected = statuses.filter((s) => DETECTED.has(s)).length;
  const valid = detected + statuses.filter((s) => UNDETECTED.has(s)).length;
  return valid === 0 ? 100 : (100 * detected) / valid;
}

/** Score per module, keyed by repo-relative path. */
export function moduleScores(report: MutationReport, root: string = REPO_ROOT): Record<string, number> {
  return Object.fromEntries(
    Object.entries(report.files).map(([file, { mutants }]) => [
      isAbsolute(file) ? toPosix(file, root) : file,
      Number(mutationScore(mutants.map((m) => m.status)).toFixed(2))
    ])
  );
}

/** Every way the report disagrees with the recorded floors, sorted. Empty means the check passes. */
export function mutationFloorFindings(report: MutationReport, floors: MutationFloors, root: string = REPO_ROOT): string[] {
  const scores = moduleScores(report, root);
  const findings: string[] = [];
  for (const [file, score] of Object.entries(scores)) {
    const floor = floors.files[file];
    if (floor === undefined) findings.push(`unfloored: ${file} scored ${score}% and has no floor`);
    else if (score < floor) findings.push(`below-floor: ${file} ${score}% < floor ${floor}%`);
    else if (score >= floor + floors.staleMargin)
      findings.push(`stale-floor: ${file} ${score}% >= floor ${floor}% + ${floors.staleMargin}; raise it to ${Math.floor(score)}`);
  }
  for (const file of Object.keys(floors.files)) {
    if (!(file in scores)) findings.push(`unmeasured: ${file} has a floor but was not mutated`);
  }
  return findings.sort();
}

/** Floors raised to the measured scores, rounded down; modules without a floor get one. A floor is never lowered. */
export function raisedMutationFloors(report: MutationReport, floors: MutationFloors, root: string = REPO_ROOT): MutationFloors {
  const files = { ...floors.files };
  for (const [file, score] of Object.entries(moduleScores(report, root))) {
    files[file] = Math.max(files[file] ?? 0, Math.floor(score));
  }
  return { ...floors, files };
}

/** The findings that fail the check. With `stale: "warn"`, a floor to raise is reported but does not fail. */
export function failingFindings(findings: string[], stale: "fail" | "warn" = "fail"): string[] {
  return stale === "warn" ? findings.filter((f) => !f.startsWith("stale-floor:")) : findings;
}

/** Markdown for a CI step summary: overall score, every finding, and the weakest modules. */
export function mutationSummary(report: MutationReport, findings: string[], title: string, weakest = 15): string {
  const statuses = Object.values(report.files).flatMap(({ mutants }) => mutants.map((m) => m.status));
  const scored = statuses.filter((s) => DETECTED.has(s) || UNDETECTED.has(s)).length;
  const scores = Object.entries(moduleScores(report)).sort(([, a], [, b]) => a - b);
  const lines = [
    `## ${title}`,
    "",
    `${mutationScore(statuses).toFixed(2)}% over ${scores.length} modules and ${scored} scored mutants.`,
    ""
  ];
  if (findings.length === 0) lines.push("Every module holds its floor.", "");
  else lines.push(...findings.map((f) => `- ${f}`), "");
  lines.push("| Score | Module |", "|------:|--------|", ...scores.slice(0, weakest).map(([file, score]) => `| ${score.toFixed(2)}% | \`${file}\` |`));
  return lines.join("\n") + "\n";
}

export const MUTATION_FLOORS_PATH = resolve(REPO_ROOT, "tests/mutation/mutation-floors.json");
export const NIGHTLY_MUTATION_FLOORS_PATH = resolve(REPO_ROOT, "tests/mutation/nightly-mutation-floors.json");

/** The value after `--name`, if given. */
function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const valued = new Set(["--floors", "--summary", "--stale"].flatMap((name) => option(args, name) ?? []));
  const reportPath = resolve(args.find((a) => !a.startsWith("--") && !valued.has(a)) ?? "reports/mutation/mutation.json");
  const floorsPath = resolve(option(args, "--floors") ?? MUTATION_FLOORS_PATH);
  const stale = option(args, "--stale") ?? "fail";
  if (stale !== "fail" && stale !== "warn") throw new Error(`--stale must be fail or warn, not ${stale}`);
  const report: MutationReport = JSON.parse(readText(reportPath));
  const floors: MutationFloors = JSON.parse(readText(floorsPath));
  if (args.includes("--update")) {
    writeFileSync(floorsPath, JSON.stringify(raisedMutationFloors(report, floors), null, 2) + "\n");
    process.stdout.write(`raised floors in ${toPosix(floorsPath)}\n`);
    return;
  }
  for (const [file, score] of Object.entries(moduleScores(report))) process.stdout.write(`  ${score.toFixed(2).padStart(6)}%  ${file}\n`);
  const findings = mutationFloorFindings(report, floors);
  for (const finding of findings) process.stdout.write(finding + "\n");
  const summary = option(args, "--summary");
  if (summary) appendFileSync(summary, mutationSummary(report, findings, `Mutation floors (${toPosix(floorsPath)})`));
  if (failingFindings(findings, stale).length > 0) process.exit(1);
  process.stdout.write("mutation floors hold\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
