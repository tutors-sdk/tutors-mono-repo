/**
 * Coverage floors (Rules 0111 and 0112). Vitest fails a run below a floor; this
 * check adds the other half of the ratchet: once coverage rises `staleMargin`
 * points above a floor, the floor must be raised in the same change, so a later
 * regression cannot hide in the gap.
 *
 *   pnpm test:coverage                       # writes coverage/coverage-summary.json
 *   pnpm check:coverage-floors               # below-floor and stale-floor findings
 *   pnpm check:coverage-floors --update      # raise floors to the measured values
 *
 * Floors live in tests/suite-health/coverage-floors.json: one set for the whole
 * measure and one per `<dir>/**` package scope.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, readText, toPosix } from "./lib/repo.ts";

export const METRICS = ["statements", "branches", "functions", "lines"] as const;
export type Metric = (typeof METRICS)[number];
export type Floors = Record<Metric, number>;

export interface CoverageFloors {
  staleMargin: number;
  global: Floors;
  packages: Record<string, Floors>;
}

interface Counts {
  total: number;
  covered: number;
}

/** The shape of Vitest's `json-summary` reporter: `total` plus one entry per absolute file path. */
export type CoverageSummary = Record<string, Record<Metric, Counts & { pct: number | string }>>;

export type Measured = Record<Metric, number>;

const GLOB_SUFFIX = "/**";

function percent({ covered, total }: Counts): number {
  // Istanbul reports an empty metric as 100%; so does this.
  return total === 0 ? 100 : (100 * covered) / total;
}

/** Measured percentages for every file under `prefix` (repo-relative, no trailing slash), or null if none. */
export function measureScope(summary: CoverageSummary, prefix: string, root: string = REPO_ROOT): Measured | null {
  const sums = Object.fromEntries(METRICS.map((m) => [m, { total: 0, covered: 0 }])) as Record<Metric, Counts>;
  let files = 0;
  for (const [file, entry] of Object.entries(summary)) {
    if (file === "total") continue;
    if (!toPosix(file, root).startsWith(prefix + "/")) continue;
    files++;
    for (const m of METRICS) {
      sums[m].total += entry[m].total;
      sums[m].covered += entry[m].covered;
    }
  }
  if (files === 0) return null;
  return Object.fromEntries(METRICS.map((m) => [m, percent(sums[m])])) as Measured;
}

export function measureTotal(summary: CoverageSummary): Measured {
  return Object.fromEntries(METRICS.map((m) => [m, percent(summary.total[m])])) as Measured;
}

function compare(scope: string, floors: Floors, measured: Measured, margin: number): string[] {
  const findings: string[] = [];
  for (const m of METRICS) {
    const value = Number(measured[m].toFixed(2));
    if (value < floors[m]) findings.push(`below-floor: ${scope} ${m} ${value}% < floor ${floors[m]}%`);
    else if (value >= floors[m] + margin)
      findings.push(`stale-floor: ${scope} ${m} ${value}% >= floor ${floors[m]}% + ${margin}; raise it to ${Math.floor(value)}`);
  }
  return findings;
}

/** Every way the summary disagrees with the recorded floors, sorted. Empty means the check passes. */
export function coverageFloorFindings(summary: CoverageSummary, floors: CoverageFloors, root: string = REPO_ROOT): string[] {
  const findings = compare("total", floors.global, measureTotal(summary), floors.staleMargin);
  for (const [scope, scopeFloors] of Object.entries(floors.packages)) {
    if (!scope.endsWith(GLOB_SUFFIX)) {
      findings.push(`bad-scope: ${scope} must end in ${GLOB_SUFFIX}`);
      continue;
    }
    const measured = measureScope(summary, scope.slice(0, -GLOB_SUFFIX.length), root);
    if (!measured) findings.push(`empty-scope: ${scope} matches no measured file`);
    else findings.push(...compare(scope, scopeFloors, measured, floors.staleMargin));
  }
  return findings.sort();
}

function raise(floors: Floors, measured: Measured | null): Floors {
  if (!measured) return floors;
  return Object.fromEntries(METRICS.map((m) => [m, Math.max(floors[m], Math.floor(Number(measured[m].toFixed(2))))])) as Floors;
}

/** Floors raised to the measured values, rounded down. A floor is never lowered. */
export function raisedFloors(summary: CoverageSummary, floors: CoverageFloors, root: string = REPO_ROOT): CoverageFloors {
  return {
    ...floors,
    global: raise(floors.global, measureTotal(summary)),
    packages: Object.fromEntries(
      Object.entries(floors.packages).map(([scope, f]) => [scope, raise(f, measureScope(summary, scope.slice(0, -GLOB_SUFFIX.length), root))])
    )
  };
}

/** The floors file as committed: one line per scope, so a raised floor is a one-line diff. */
export function formatFloors(floors: CoverageFloors): string {
  const line = (f: Floors) => `{ ${METRICS.map((m) => `"${m}": ${f[m]}`).join(", ")} }`;
  const { global, packages, ...rest } = floors;
  const head = Object.entries(rest).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const scopes = Object.entries(packages).map(([scope, f]) => `    ${JSON.stringify(scope)}: ${line(f)}`);
  return ["{", ...head, `  "global": ${line(global)},`, '  "packages": {', scopes.join(",\n"), "  }", "}", ""].join("\n");
}

export const FLOORS_PATH = resolve(REPO_ROOT, "tests/suite-health/coverage-floors.json");

function main() {
  const args = process.argv.slice(2);
  const update = args.includes("--update");
  const summaryPath = resolve(args.find((a) => !a.startsWith("--")) ?? "coverage/coverage-summary.json");
  const summary: CoverageSummary = JSON.parse(readText(summaryPath));
  const floors: CoverageFloors = JSON.parse(readText(FLOORS_PATH));
  if (update) {
    writeFileSync(FLOORS_PATH, formatFloors(raisedFloors(summary, floors)));
    process.stdout.write(`raised floors in ${toPosix(FLOORS_PATH)}\n`);
    return;
  }
  const findings = coverageFloorFindings(summary, floors);
  for (const finding of findings) process.stdout.write(finding + "\n");
  if (findings.length > 0) process.exit(1);
  process.stdout.write("coverage floors hold\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
