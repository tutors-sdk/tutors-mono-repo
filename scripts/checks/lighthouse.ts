/**
 * Lighthouse on the reference pages (runway tier L).
 *
 *   pnpm --dir tests/performance/lighthouse install --ignore-workspace --frozen-lockfile
 *   pnpm exec playwright install chromium
 *   pnpm check:lighthouse --image tutors/reader:local
 *   pnpm check:lighthouse --base-url http://localhost:3000 --record reports/lighthouse-samples.json
 *   pnpm check:lighthouse --image tutors/reader:local --baseline tests/performance/lighthouse-baseline.json
 *
 * Pages, run count and score floors live in tests/performance/lighthouse.json.
 * Each page is audited several times; scores are judged by their median
 * against the floors, and with --baseline every score and timing is compared
 * with recorded samples through lib/stats.ts rather than a raw percentage.
 *
 * Course pages render in the browser from a course site. `{course}` and `{lab}`
 * in a page path are replaced by LIGHTHOUSE_COURSE and LIGHTHOUSE_LAB (defaults:
 * the Netlify reference course). The nightly job serves the tier G fixture
 * course instead, so GitHub and Netlify are not dependencies of the run:
 *
 *   pnpm e2e:stack:fixture
 *   docker compose -f tests/e2e-stack/compose.yaml up -d --wait course
 *   LIGHTHOUSE_COURSE=localhost:8080 LIGHTHOUSE_LAB=unit-1/topic-01/book-lab-01  *     pnpm check:lighthouse --image tutors/reader:local
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareSamples } from "./lib/stats.ts";
import { REPO_ROOT, readText } from "./lib/repo.ts";

/* ---------------- pure helpers ---------------- */

export const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Lab metrics kept per run; all lower-is-better. */
export const METRICS = {
  fcpMs: "first-contentful-paint",
  lcpMs: "largest-contentful-paint",
  tbtMs: "total-blocking-time",
  cls: "cumulative-layout-shift",
  speedIndexMs: "speed-index"
} as const;
export type Metric = keyof typeof METRICS;

export interface LighthouseConfig {
  note?: string;
  runs: number;
  preset: "desktop" | "mobile";
  /** `floors` on a page overrides the global floor for that page only, with a `why`. */
  pages: { name: string; path: string; floors?: Partial<Record<Category, number>>; why?: string }[];
  floors: Record<Category, number>;
}

export interface LighthouseRun {
  scores: Partial<Record<Category, number>>;
  metrics: Partial<Record<Metric, number>>;
  runtimeError?: string;
}

interface Lhr {
  runtimeError?: { code: string; message: string };
  categories: Record<string, { score: number | null }>;
  audits: Record<string, { numericValue?: number }>;
}

export function extractRun(lhr: Lhr): LighthouseRun {
  const scores: LighthouseRun["scores"] = {};
  for (const category of CATEGORIES) {
    const score = lhr.categories[category]?.score;
    if (typeof score === "number") scores[category] = score;
  }
  const metrics: LighthouseRun["metrics"] = {};
  for (const [key, audit] of Object.entries(METRICS) as [Metric, string][]) {
    const value = lhr.audits[audit]?.numericValue;
    if (typeof value === "number") metrics[key] = Math.round(value * 1000) / 1000;
  }
  return { scores, metrics, runtimeError: lhr.runtimeError ? `${lhr.runtimeError.code}: ${lhr.runtimeError.message}` : undefined };
}

/** page -> "score:performance" | "metric:lcpMs" -> samples. The format of --record and --baseline files. */
export type LighthouseSamples = Record<string, Record<string, number[]>>;

export function collectLighthouseSamples(runsByPage: Record<string, LighthouseRun[]>): LighthouseSamples {
  const samples: LighthouseSamples = {};
  for (const [page, runs] of Object.entries(runsByPage)) {
    const bucket: Record<string, number[]> = (samples[page] = {});
    for (const run of runs.filter((r) => !r.runtimeError)) {
      for (const [category, score] of Object.entries(run.scores)) (bucket[`score:${category}`] ??= []).push(score);
      for (const [metric, value] of Object.entries(run.metrics)) (bucket[`metric:${metric}`] ??= []).push(value);
    }
  }
  return samples;
}

const middle = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];

/** Runtime errors and median category scores under their floors. */
export function floorFindings(
  runsByPage: Record<string, LighthouseRun[]>,
  floors: Record<Category, number>,
  pageFloors: Record<string, Partial<Record<Category, number>>> = {}
): string[] {
  const findings: string[] = [];
  for (const [page, runs] of Object.entries(runsByPage)) {
    const effective = { ...floors, ...pageFloors[page] };
    for (const run of runs) if (run.runtimeError) findings.push(`runtime-error: ${page}: ${run.runtimeError}`);
    const ok = runs.filter((r) => !r.runtimeError);
    if (ok.length === 0) continue;
    for (const category of CATEGORIES) {
      const scores = ok.map((r) => r.scores[category]).filter((s): s is number => typeof s === "number");
      if (scores.length === 0) {
        findings.push(`missing-score: ${page}: ${category}`);
        continue;
      }
      // The lower median, so an even run count cannot round a failing page up.
      const score = middle(scores);
      if (score < effective[category]) findings.push(`below-floor: ${page}: ${category} ${score.toFixed(2)} < ${effective[category].toFixed(2)}`);
    }
  }
  return findings;
}

/** Scores are higher-is-better; timings lower-is-better with a 50 ms floor; CLS with a 0.02 floor. */
export function lighthouseBaselineFindings(baseline: LighthouseSamples, candidate: LighthouseSamples): { findings: string[]; notes: string[] } {
  const findings: string[] = [];
  const notes: string[] = [];
  for (const [page, series] of Object.entries(candidate)) {
    for (const [key, values] of Object.entries(series)) {
      const base = baseline[page]?.[key];
      if (!base) {
        notes.push(`${page} ${key}: no baseline samples`);
        continue;
      }
      const isScore = key.startsWith("score:");
      const result = compareSamples(base, values, {
        better: isScore ? "higher" : "lower",
        relativeFloor: isScore ? 0.03 : 0.1,
        absoluteFloor: isScore ? 0.02 : key === "metric:cls" ? 0.02 : 50
      });
      const line = `${page} ${key}: median ${result.candidateMedian} vs ${result.baselineMedian}: ${result.verdict}`;
      if (result.verdict === "regression") findings.push(`lighthouse-regression: ${line}`);
      else notes.push(line);
    }
  }
  return { findings, notes };
}

/** Where `{course}` and `{lab}` point when LIGHTHOUSE_COURSE and LIGHTHOUSE_LAB are unset. */
export const DEFAULT_PAGE_VARS = { course: "reference-course", lab: "topic-01-typical/unit-1/book-a" };

/** Replaces `{name}` placeholders; a placeholder with no value is a config error, not a 404 to audit. */
export function resolvePagePath(path: string, vars: Record<string, string>): string {
  return path.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    if (vars[name] === undefined) throw new Error(`${path}: no value for ${placeholder}`);
    return vars[name];
  });
}

/* ---------------- runner ---------------- */

const LIGHTHOUSE_CLI = join(REPO_ROOT, "tests/performance/lighthouse/node_modules/lighthouse/cli/index.js");
export const CONFIG_FILE = "tests/performance/lighthouse.json";

interface Options {
  image?: string;
  baseUrl?: string;
  record?: string;
  baseline?: string;
  runs?: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--image") options.image = argv[++i];
    else if (argv[i] === "--base-url") options.baseUrl = argv[++i];
    else if (argv[i] === "--record") options.record = argv[++i];
    else if (argv[i] === "--baseline") options.baseline = argv[++i];
    else if (argv[i] === "--runs") options.runs = Number(argv[++i]);
  }
  options.baseUrl ??= process.env.LIGHTHOUSE_BASE_URL;
  if (!options.image && !options.baseUrl) {
    console.error("usage: lighthouse.ts (--image <image> | --base-url <url>) [--runs N] [--record file] [--baseline file]");
    process.exit(2);
  }
  return options;
}

async function chromiumPath(): Promise<string> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const { chromium } = await import("@playwright/test");
  const path = chromium.executablePath();
  if (!existsSync(path)) throw new Error(`Chromium not found at ${path}; run pnpm exec playwright install chromium`);
  return path;
}

function startImage(image: string): { baseUrl: string; stop: () => void } {
  const name = `tutors-lighthouse-${randomUUID().slice(0, 8)}`;
  execFileSync("docker", [
    "run", "--detach", "--name", name, "--publish", "127.0.0.1::3000",
    "--read-only", "--tmpfs", "/tmp", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--env-file", join(REPO_ROOT, ".env.example"), "--env", "PUBLIC_ANON_MODE=TRUE", "--env", "LOG_LEVEL=warn", image
  ]);
  const port = execFileSync("docker", ["port", name, "3000/tcp"], { encoding: "utf8" }).trim().split("\n")[0].split(":").pop();
  const baseUrl = `http://127.0.0.1:${port}`;
  // ORIGIN only matters for form posts; Lighthouse only issues GETs.
  return { baseUrl, stop: () => void spawnSync("docker", ["rm", "--force", name], { stdio: "ignore" }) };
}

async function waitLive(baseUrl: string, budgetMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    try {
      if ((await fetch(`${baseUrl}/healthz/live`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${baseUrl} was not live within ${budgetMs} ms`);
}

function audit(url: string, chrome: string, preset: LighthouseConfig["preset"], outDir: string): LighthouseRun {
  const output = join(outDir, `${randomUUID()}.json`);
  const args = [
    LIGHTHOUSE_CLI, url,
    "--output=json", `--output-path=${output}`, "--quiet",
    `--only-categories=${CATEGORIES.join(",")}`,
    `--chrome-path=${chrome}`,
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
    ...(preset === "desktop" ? ["--preset=desktop"] : [])
  ];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (!existsSync(output)) return { scores: {}, metrics: {}, runtimeError: `lighthouse exited ${result.status}: ${(result.stderr || "").trim().split("\n").slice(-3).join(" ")}` };
  return extractRun(JSON.parse(readFileSync(output, "utf8")));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config: LighthouseConfig = JSON.parse(readText(join(REPO_ROOT, CONFIG_FILE)));
  if (!existsSync(LIGHTHOUSE_CLI)) {
    console.error("Lighthouse is not installed: pnpm --dir tests/performance/lighthouse install --ignore-workspace --frozen-lockfile");
    process.exit(2);
  }
  const chrome = await chromiumPath();
  const vars = {
    course: process.env.LIGHTHOUSE_COURSE ?? DEFAULT_PAGE_VARS.course,
    lab: process.env.LIGHTHOUSE_LAB ?? DEFAULT_PAGE_VARS.lab
  };
  const started = options.image ? startImage(options.image) : undefined;
  const baseUrl = (started?.baseUrl ?? options.baseUrl!).replace(/\/$/, "");
  const outDir = mkdtempSync(join(tmpdir(), "tutors-lighthouse-"));
  const runs = options.runs ?? config.runs;
  const runsByPage: Record<string, LighthouseRun[]> = {};

  try {
    await waitLive(baseUrl);
    for (const page of config.pages) {
      const url = `${baseUrl}${resolvePagePath(page.path, vars)}`;
      runsByPage[page.name] = [];
      for (let run = 1; run <= runs; run++) {
        const result = audit(url, chrome, config.preset, outDir);
        runsByPage[page.name].push(result);
        const scores = CATEGORIES.map((c) => `${c} ${result.scores[c]?.toFixed(2) ?? "-"}`).join(", ");
        const metrics = Object.entries(result.metrics).map(([m, v]) => `${m} ${v}`).join(", ");
        console.log(`${page.name} run ${run}: ${result.runtimeError ?? `${scores}; ${metrics}`}`);
      }
    }
  } finally {
    started?.stop();
  }

  const pageFloors = Object.fromEntries(config.pages.filter((p) => p.floors).map((p) => [p.name, p.floors!]));
  const findings = floorFindings(runsByPage, config.floors, pageFloors);
  const samples = collectLighthouseSamples(runsByPage);
  if (options.record) {
    mkdirSync(resolve(options.record, ".."), { recursive: true });
    writeFileSync(resolve(options.record), JSON.stringify({ preset: config.preset, runs, samples }, null, 2) + "\n");
    console.log(`recorded samples to ${options.record}`);
  }
  if (options.baseline) {
    const compared = lighthouseBaselineFindings(JSON.parse(readText(resolve(options.baseline))).samples, samples);
    compared.notes.forEach((note) => console.log(`baseline: ${note}`));
    findings.push(...compared.findings);
  }
  findings.forEach((finding) => console.log(`finding: ${finding}`));
  if (findings.length > 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
