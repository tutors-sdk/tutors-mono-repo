/**
 * Per-app client bundle budgets (runway tier L).
 *
 *   SVELTEKIT_ADAPTER=node pnpm --filter "tutors-<app>..." build
 *   pnpm check:bundle                    # every app with a build; missing builds fail
 *   pnpm check:bundle --apps reader      # just these
 *   pnpm check:bundle --propose          # print ceilings = measured + headroom (never writes)
 *
 * Measures what a student's browser downloads: the gzip size of every JS and
 * CSS file under SvelteKit's `.svelte-kit/output/client/_app/immutable`, which
 * is the same whichever adapter built it. Ceilings live in
 * tests/performance/bundle-budgets.json; raising one is a reviewed diff.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { REPO_ROOT, readText, toPosix, walk } from "./lib/repo.ts";

export interface BundleBudget {
  /** Total gzip bytes of every JS file. */
  jsGzipBytes: number;
  /** Total gzip bytes of every CSS file. */
  cssGzipBytes: number;
  /** Gzip bytes of the single largest JS chunk; catches one dependency ballooning a shared chunk. */
  largestJsChunkGzipBytes: number;
}

export interface BudgetsFile {
  note?: string;
  headroom: number;
  apps: Record<string, BundleBudget>;
}

export interface ChunkSize {
  file: string;
  bytes: number;
  gzipBytes: number;
}

export interface BundleMeasurement {
  jsGzipBytes: number;
  cssGzipBytes: number;
  largestJsChunk: ChunkSize | undefined;
  chunks: ChunkSize[];
}

export const CLIENT_OUTPUT = ".svelte-kit/output/client";

export function clientDirFor(app: string, root: string = REPO_ROOT): string {
  return join(root, "apps", app, CLIENT_OUTPUT);
}

/** Gzip size at level 9, roughly what a CDN or compression middleware serves. */
export function gzipSize(contents: Buffer | string): number {
  return gzipSync(contents, { level: 9 }).length;
}

export function measureClientBundle(clientDir: string): BundleMeasurement {
  const immutable = join(clientDir, "_app/immutable");
  const chunks = walk(immutable, (name) => /\.(m?js|css)$/.test(name))
    .map((path) => {
      const contents = readFileSync(path);
      return { file: toPosix(path, clientDir), bytes: contents.length, gzipBytes: gzipSize(contents) };
    })
    .sort((a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file));
  const js = chunks.filter((c) => /\.m?js$/.test(c.file));
  const css = chunks.filter((c) => c.file.endsWith(".css"));
  const sum = (list: ChunkSize[]) => list.reduce((total, c) => total + c.gzipBytes, 0);
  return { jsGzipBytes: sum(js), cssGzipBytes: sum(css), largestJsChunk: js[0], chunks };
}

export function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Findings are `over-budget: <app>: <what> <measured> > <ceiling>`. */
export function bundleBudgetFindings(app: string, measured: BundleMeasurement, budget: BundleBudget | undefined): string[] {
  if (!budget) return [`no-budget: ${app}: add it to tests/performance/bundle-budgets.json`];
  if (measured.chunks.length === 0) return [`empty-build: ${app}: no JS or CSS under _app/immutable`];
  const findings: string[] = [];
  if (measured.jsGzipBytes > budget.jsGzipBytes) {
    findings.push(`over-budget: ${app}: total JS ${formatKb(measured.jsGzipBytes)} gzip > ${formatKb(budget.jsGzipBytes)}`);
  }
  if (measured.cssGzipBytes > budget.cssGzipBytes) {
    findings.push(`over-budget: ${app}: total CSS ${formatKb(measured.cssGzipBytes)} gzip > ${formatKb(budget.cssGzipBytes)}`);
  }
  const largest = measured.largestJsChunk;
  if (largest && largest.gzipBytes > budget.largestJsChunkGzipBytes) {
    findings.push(
      `over-budget: ${app}: largest chunk ${largest.file} ${formatKb(largest.gzipBytes)} gzip > ${formatKb(budget.largestJsChunkGzipBytes)}`
    );
  }
  return findings;
}

/**
 * Budgets far above what the app ships stop protecting anything. Not a
 * failure (it would punish the PR that made the app smaller), just a nudge
 * to lower the ceiling in the same PR.
 */
export function slackNotes(app: string, measured: BundleMeasurement, budget: BundleBudget, headroom: number): string[] {
  const loose = (value: number, ceiling: number) => ceiling > proposeCeiling(value, headroom * 3);
  const notes: string[] = [];
  if (loose(measured.jsGzipBytes, budget.jsGzipBytes)) notes.push(`${app}: JS ceiling is loose; propose ${proposeCeiling(measured.jsGzipBytes, headroom)}`);
  if (loose(measured.cssGzipBytes, budget.cssGzipBytes)) notes.push(`${app}: CSS ceiling is loose; propose ${proposeCeiling(measured.cssGzipBytes, headroom)}`);
  return notes;
}

/** Measured size plus headroom, rounded up to the next KiB so small churn does not rewrite the file. */
export function proposeCeiling(bytes: number, headroom: number): number {
  return Math.ceil((bytes * (1 + headroom)) / 1024) * 1024;
}

export function proposeBudget(measured: BundleMeasurement, headroom: number): BundleBudget {
  return {
    jsGzipBytes: proposeCeiling(measured.jsGzipBytes, headroom),
    cssGzipBytes: proposeCeiling(measured.cssGzipBytes, headroom),
    largestJsChunkGzipBytes: proposeCeiling(measured.largestJsChunk?.gzipBytes ?? 0, headroom)
  };
}

export const BUDGETS_FILE = "tests/performance/bundle-budgets.json";

export function readBudgets(root: string = REPO_ROOT): BudgetsFile {
  return JSON.parse(readText(join(root, BUDGETS_FILE)));
}

function main(argv: string[]) {
  const budgets = readBudgets();
  const appsIndex = argv.indexOf("--apps");
  const apps = appsIndex >= 0 ? argv[appsIndex + 1].split(",") : Object.keys(budgets.apps);
  const propose = argv.includes("--propose");
  const proposal: Record<string, BundleBudget> = {};
  const findings: string[] = [];

  for (const app of apps) {
    const dir = clientDirFor(app);
    if (!existsSync(dir)) {
      findings.push(`not-built: ${app}: ${toPosix(dir)} is missing (SVELTEKIT_ADAPTER=node pnpm --filter "tutors-${app}..." build)`);
      continue;
    }
    const measured = measureClientBundle(dir);
    process.stdout.write(
      `${app.padEnd(10)} js ${formatKb(measured.jsGzipBytes).padStart(10)}  css ${formatKb(measured.cssGzipBytes).padStart(9)}  ` +
        `largest ${formatKb(measured.largestJsChunk?.gzipBytes ?? 0).padStart(9)} ${measured.largestJsChunk?.file ?? ""}\n`
    );
    proposal[app] = proposeBudget(measured, budgets.headroom);
    if (propose) continue;
    findings.push(...bundleBudgetFindings(app, measured, budgets.apps[app]));
    if (budgets.apps[app]) slackNotes(app, measured, budgets.apps[app], budgets.headroom).forEach((note) => process.stdout.write(`note: ${note}\n`));
  }

  if (propose) {
    process.stdout.write(JSON.stringify({ headroom: budgets.headroom, apps: { ...budgets.apps, ...proposal } }, null, 2) + "\n");
    return;
  }
  for (const finding of findings) {
    process.stdout.write(finding + "\n");
    if (process.env.GITHUB_ACTIONS) process.stdout.write(`::error file=${BUDGETS_FILE}::${finding}\n`);
  }
  if (findings.length > 0) process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")) main(process.argv.slice(2));
