/**
 * The quality record of one commit (Rules 0221 to 0225): the mutation score of every package, whether the package
 * changed since a base, and the result of every nightly job, in one quality.json. The release harness reads it
 * with `--test-signal` and marks the readiness page's Tests from it.
 *
 *   pnpm release:quality                                    # quality.json for HEAD, from reports/mutation-nightly/mutation.json
 *   pnpm release:quality --since v16.2.1                    # changed since v16.2.1, not since production
 *   pnpm release:quality --jobs "$NEEDS" --evidence "$RUN_URL" --out quality.json   # what nightly.yml runs
 *
 * Options:
 *   --report <file>   the Stryker JSON report; default reports/mutation-nightly/mutation.json. Absent: no packages
 *                     are written (Rule 0225), so the harness sees no mutation evidence instead of a clean one.
 *   --commit <sha>    default HEAD.
 *   --since <ref>     the base a package is changed against; default the production commit in release/deployed.json.
 *                     No base, or a base git cannot diff against: every package counts as changed (Rule 0223).
 *   --jobs <json>     the nightly job results: `${{ toJSON(needs) }}` or { "<job>": "<result>" }.
 *   --evidence <url>  where the record came from (the nightly run); the harness cites it.
 *   --out <file>      default quality.json.
 *
 * The shape (the harness reads `packages` and `evidence`; everything else is extra and ignored by it):
 *
 *   { "schemaVersion": 1, "commit": sha, "base": ref | null, "generatedAt": iso, "evidence"?: url,
 *     "packages"?: [{ "name", "mutationScore": 0-100, "changed": boolean, "path" }],
 *     "nightly"?: { "result": "success" | "failure", "jobs": { "<job>": "success" | "failure" | "cancelled" | "skipped" } } }
 *
 * A package's score is Stryker's score over every mutant of every module in it (not the mean of its modules), with the
 * module statuses read the way scripts/checks/mutation-floors.ts reads them. A package is the nearest package.json
 * above a module.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readDeployed, type DeployedRecord } from "./deploy-pins.ts";
import { REPO_ROOT, readText } from "./lib/repo.ts";
import { moduleStatuses, mutationScore, type MutationReport } from "./mutation-floors.ts";

export const DEFAULT_REPORT = "reports/mutation-nightly/mutation.json";

export interface QualityPackage {
  /** The package.json name, as the harness names a package. */
  name: string;
  mutationScore: number;
  /** A file under `path` differs between the base and the commit, or there was no base. */
  changed: boolean;
  /** The package directory, repo-relative. */
  path: string;
}

export interface QualityRecord {
  schemaVersion: 1;
  commit: string;
  /** What `changed` compares with; null when there was nothing to compare with. */
  base: string | null;
  generatedAt: string;
  evidence?: string;
  /** Absent when there was no Stryker report. */
  packages?: QualityPackage[];
  nightly?: { result: "success" | "failure"; jobs: Record<string, string> };
}

export interface QualityInput {
  commit: string;
  report?: MutationReport;
  /** The base the maintainer named, if any. */
  since?: string;
  deployed?: DeployedRecord;
  /** Files that differ between `base` and the commit; undefined when git cannot say. */
  diff: (base: string) => string[] | undefined;
  jobs?: Record<string, string>;
  evidence?: string;
  generatedAt: string;
  /** The package a repo-relative module belongs to. */
  packageOf?: (module: string) => { name: string; path: string };
}

/** The package a module belongs to: the nearest package.json above it, below the repository root. */
export function packageOf(module: string, root: string = REPO_ROOT): { name: string; path: string } {
  for (let dir = dirname(module); dir !== "." && dir !== "/" && dir !== ""; dir = dirname(dir)) {
    const manifest = join(root, dir, "package.json");
    if (existsSync(manifest)) return { name: (JSON.parse(readText(manifest)) as { name?: string }).name ?? dir, path: dir };
  }
  return { name: module, path: module };
}

/** The nightly job results from `${{ toJSON(needs) }}` ({ job: { result } }) or a plain { job: result } map. */
export function jobResults(json: string): Record<string, string> {
  const raw = JSON.parse(json) as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("--jobs: expected a JSON object of job results");
  const jobs: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const result = typeof value === "string" ? value : (value as { result?: unknown } | null)?.result;
    if (typeof result !== "string") throw new Error(`--jobs: no result for the job ${id}`);
    jobs[id] = result;
  }
  return jobs;
}

/** The night fails when any job failed or was cancelled; a skipped job does not fail it. */
export function nightResult(jobs: Record<string, string>): "success" | "failure" {
  return Object.values(jobs).some((r) => r === "failure" || r === "cancelled") ? "failure" : "success";
}

export function qualityRecord(input: QualityInput): QualityRecord {
  const base = input.since ?? input.deployed?.commit;
  const differing = base === undefined ? undefined : input.diff(base);
  const record: QualityRecord = {
    schemaVersion: 1,
    commit: input.commit,
    base: differing === undefined ? null : base!,
    generatedAt: input.generatedAt,
    ...(input.evidence ? { evidence: input.evidence } : {})
  };
  if (input.report) {
    const owner = input.packageOf ?? ((m: string) => packageOf(m));
    const byPackage = new Map<string, { name: string; path: string; statuses: string[] }>();
    for (const [module, statuses] of Object.entries(moduleStatuses(input.report))) {
      const { name, path } = owner(module);
      const entry = byPackage.get(path) ?? { name, path, statuses: [] };
      entry.statuses.push(...statuses);
      byPackage.set(path, entry);
    }
    record.packages = [...byPackage.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, path, statuses }) => ({
        name,
        mutationScore: Number(mutationScore(statuses).toFixed(2)),
        changed: differing === undefined || differing.some((file) => file.startsWith(`${path}/`)),
        path
      }));
  }
  if (input.jobs) record.nightly = { result: nightResult(input.jobs), jobs: input.jobs };
  return record;
}

/** The value after `--name`, if given. */
function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function main() {
  const args = process.argv.slice(2);
  const reportPath = resolve(option(args, "--report") ?? DEFAULT_REPORT);
  const commit = option(args, "--commit") ?? git(["rev-parse", "HEAD"]);
  const jobs = option(args, "--jobs");
  const report = existsSync(reportPath) ? (JSON.parse(readText(reportPath)) as MutationReport) : undefined;
  if (!report) process.stderr.write(`no Stryker report at ${reportPath}: writing the record without mutation scores\n`);
  const record = qualityRecord({
    commit,
    report,
    since: option(args, "--since"),
    deployed: readDeployed(),
    diff: (base) => {
      try {
        return git(["diff", "--name-only", base, commit]).split("\n").filter(Boolean);
      } catch {
        process.stderr.write(`cannot diff ${base}..${commit}: every package counts as changed\n`);
        return undefined;
      }
    },
    jobs: jobs ? jobResults(jobs) : undefined,
    evidence: option(args, "--evidence"),
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  });
  const out = resolve(option(args, "--out") ?? "quality.json");
  writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
  const changed = record.packages?.filter((p) => p.changed).length ?? 0;
  process.stdout.write(`${out}: ${record.packages?.length ?? 0} packages (${changed} changed since ${record.base ?? "nothing"})${record.nightly ? `, night ${record.nightly.result}` : ""}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
