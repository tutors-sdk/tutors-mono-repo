/**
 * Mutation on pull requests (Rules 0618 and 0619). The nightly comprehensive run (Rules 0116-0119) finds a weakened
 * module the morning after it merged; this mutates only the library modules a pull request changes, with the nightly
 * run's own configuration, and holds each to its nightly floor before it merges. It is ESI.ts's `mutation:pr` gate
 * (lgriffin/ESI.ts scripts/mutation/mutation-pr.ts) on this repo's floors.
 *
 *   pnpm test:mutation:pr                     # modules changed since the merge base with origin/main (or main)
 *   pnpm test:mutation:pr --base <ref>        # ... since another ref (or MUTATION_BASE_REF=<ref>)
 *   pnpm test:mutation:pr --summary <file>    # append a markdown table (CI: "$GITHUB_STEP_SUMMARY")
 *
 * A changed module below its nightly floor, or a new module with no floor, fails. A module that rose past its floor
 * is reported to raise and passes, as at night. A pull request that changes no library module passes without
 * running Stryker. With no base to compare against the check fails rather than pass on nothing.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, readText } from "./lib/repo.ts";
import { NIGHTLY_MUTATION_FLOORS_PATH, failingFindings, mutationFloorFindings, mutationSummary, type MutationFloors, type MutationReport } from "./mutation-floors.ts";

export const NIGHTLY_CONFIG = "stryker.nightly.config.json";
export const PR_REPORT_DIR = "reports/mutation-pr";

/** Whether Stryker's mutate list selects `file`: a positive glob matches and no `!` glob does. */
export function mutates(mutate: string[], file: string): boolean {
  const excluded = mutate.filter((g) => g.startsWith("!")).map((g) => g.slice(1));
  return mutate.some((g) => !g.startsWith("!") && matchesGlob(file, g)) && !excluded.some((g) => matchesGlob(file, g));
}

/** The changed files the nightly run would mutate: the library modules this pull request touches, sorted. */
export function changedModules(changed: string[], mutate: string[]): string[] {
  return [...new Set(changed.filter((file) => file.endsWith(".ts") && mutates(mutate, file)))].sort();
}

/**
 * The nightly floor findings for the changed modules only. Every other floor is the nightly run's business, so its
 * absence from this report is not "unmeasured"; a changed module Stryker found nothing to mutate in is not either.
 */
export function pullRequestFindings(report: MutationReport, floors: MutationFloors, modules: string[], root: string = REPO_ROOT): string[] {
  const scoped: MutationFloors = { ...floors, files: Object.fromEntries(Object.entries(floors.files).filter(([file]) => modules.includes(file))) };
  return mutationFloorFindings(report, scoped, root).filter((f) => !f.startsWith("unmeasured:"));
}

/** The findings that fail the pull request: below-floor and unfloored. A floor to raise only warns. */
export const pullRequestFailures = (findings: string[]) => failingFindings(findings, "warn");

function git(args: string[]): string | undefined {
  const run = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : undefined;
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const ref = option(args, "--base") ?? process.env.MUTATION_BASE_REF;
  const base = ref ? git(["merge-base", ref, "HEAD"]) : (git(["merge-base", "origin/main", "HEAD"]) ?? git(["merge-base", "main", "HEAD"]));
  if (!base) {
    process.stderr.write(`mutation-pr: no merge base with ${ref ?? "origin/main or main"}; fetch the base branch (fails closed)\n`);
    process.exit(2);
  }
  const changed = (git(["diff", "--name-only", "--diff-filter=AMR", `${base}...HEAD`]) ?? "").split("\n").filter(Boolean);
  const config = JSON.parse(readText(resolve(REPO_ROOT, NIGHTLY_CONFIG)));
  const modules = changedModules(changed, config.mutate);
  const summary = option(args, "--summary");
  if (modules.length === 0) {
    process.stdout.write("mutation-pr: this change touches no library module; nothing to mutate\n");
    if (summary) appendFileSync(summary, "## Mutation of changed modules\n\nNo library module changed.\n");
    return;
  }
  process.stdout.write(`mutation-pr: mutating ${modules.length} changed module(s):\n${modules.map((m) => `  ${m}`).join("\n")}\n`);

  // The nightly configuration, narrowed to the changed modules and writing its own report.
  mkdirSync(resolve(REPO_ROOT, PR_REPORT_DIR), { recursive: true });
  const prConfig = {
    ...config,
    mutate: modules,
    reporters: ["json", "clear-text", "progress-append-only"],
    jsonReporter: { fileName: `${PR_REPORT_DIR}/mutation.json` },
    htmlReporter: { fileName: `${PR_REPORT_DIR}/index.html` },
    tempDirName: ".stryker-tmp-pr"
  };
  const configPath = `${PR_REPORT_DIR}/stryker.config.json`;
  writeFileSync(resolve(REPO_ROOT, configPath), JSON.stringify(prConfig, null, 2) + "\n");
  const stryker = spawnSync("pnpm", ["exec", "stryker", "run", configPath], { cwd: REPO_ROOT, stdio: "inherit" });
  if (stryker.status !== 0) {
    process.stderr.write(`mutation-pr: Stryker exited ${stryker.status}\n`);
    process.exit(2);
  }

  const report: MutationReport = JSON.parse(readText(resolve(REPO_ROOT, PR_REPORT_DIR, "mutation.json")));
  const floors: MutationFloors = JSON.parse(readText(NIGHTLY_MUTATION_FLOORS_PATH));
  const findings = pullRequestFindings(report, floors, modules);
  for (const finding of findings) process.stdout.write(finding + "\n");
  if (summary) appendFileSync(summary, mutationSummary(report, findings, "Mutation of changed modules (nightly floors)"));
  if (pullRequestFailures(findings).length > 0) process.exit(1);
  process.stdout.write("mutation-pr: every changed module holds its nightly floor\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
