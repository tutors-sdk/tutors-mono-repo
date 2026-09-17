/**
 * Load and soak orchestration (runway tier L).
 *
 *   pnpm check:load --image tutors/reader:local --rate 20 --duration 30s
 *   pnpm check:load --image tutors/reader:local --script reader-soak.js --rate 5 --duration 45m
 *   pnpm check:load --image tutors/reader:local --runs 3 --record reports/load-samples.json
 *   pnpm check:load --image tutors/reader:local --runs 3 --baseline tests/performance/load-baseline.json
 *   pnpm check:load --image tutors/reader:local --duration 20s --env P95_MS=0 --expect-fail
 *
 * Starts the image on a private Docker network with the same hardening as the
 * container smoke test, runs the pinned k6 image against it one or more times,
 * samples container memory while k6 runs, and reports:
 *   - k6 threshold failures (p95 per page, error rate, dropped iterations)
 *   - memory growth between the first and last quarter of the run (soak leaks)
 *   - with --baseline, per-page p95 regressions judged by lib/stats.ts
 *     (medians of several runs against a noise band), never a raw percentage
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { compareSamples } from "./lib/stats.ts";
import { REPO_ROOT, readText } from "./lib/repo.ts";

export const K6_IMAGE = "grafana/k6@sha256:3ddc8b1a33a2c3d8edc6e99b6a762ae36cba08788463458f5e6a7703e14eb77d"; // 1.3.0

/* ---------------- pure helpers ---------------- */

interface SummaryMetric {
  "p(95)"?: number;
  med?: number;
  value?: number;
  count?: number;
  passes?: number;
  fails?: number;
  thresholds?: Record<string, boolean>;
}

export interface K6Summary {
  metrics: Record<string, SummaryMetric>;
}

export interface RunResult {
  p95ByPage: Record<string, number>;
  errorRate: number;
  requests: number;
  crossedThresholds: string[];
}

/**
 * Read a `k6 run --summary-export` file. In that format a threshold's boolean
 * is true when the threshold was crossed.
 */
export function readK6Summary(summary: K6Summary): RunResult {
  const p95ByPage: Record<string, number> = {};
  const crossedThresholds: string[] = [];
  for (const [name, metric] of Object.entries(summary.metrics)) {
    // `{page:home}` from load runs, `{page:home,phase:late}` from soak runs (keyed `home@late`).
    const page = name.match(/^http_req_duration\{page:([\w-]+)(?:,phase:([\w-]+))?\}$/);
    if (page && typeof metric["p(95)"] === "number") p95ByPage[page[2] ? `${page[1]}@${page[2]}` : page[1]] = metric["p(95)"];
    for (const [expression, crossed] of Object.entries(metric.thresholds ?? {})) {
      if (crossed) crossedThresholds.push(`${name} ${expression}`);
    }
  }
  return {
    p95ByPage,
    errorRate: summary.metrics.http_req_failed?.value ?? 0,
    requests: summary.metrics.http_reqs?.count ?? 0,
    crossedThresholds: crossedThresholds.sort()
  };
}

/** `123.4MiB / 7.6GiB` -> bytes of the first figure. */
export function parseDockerMemory(usage: string): number | undefined {
  const match = usage.trim().match(/^([\d.]+)\s*([KMGT]?i?B)/i);
  if (!match) return undefined;
  const units: Record<string, number> = { b: 1, kb: 1e3, kib: 1024, mb: 1e6, mib: 1024 ** 2, gb: 1e9, gib: 1024 ** 3, tb: 1e12, tib: 1024 ** 4 };
  const factor = units[match[2].toLowerCase()];
  return factor === undefined ? undefined : Number(match[1]) * factor;
}

/**
 * Memory growth under a constant arrival rate. The first quarter of samples
 * is warm-up (V8 grows its heap to a steady state: a 90 s run at 50 rps went
 * 45 -> 71 MiB and then flattened), so it is ignored; the median of the
 * second quarter is compared with the median of the last quarter. Samples
 * arrive every 5 s, so `minSamples` = 24 means only runs of two minutes or
 * more are judged; shorter runs cannot tell a leak from warm-up.
 */
export function memoryGrowthFindings(samples: number[], maxGrowth = 0.25, minSamples = 24): string[] {
  if (samples.length < minSamples) return [];
  const quarter = Math.floor(samples.length / 4);
  const middle = (list: number[]) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
  const early = middle(samples.slice(quarter, quarter * 2));
  const late = middle(samples.slice(-quarter));
  const growth = (late - early) / early;
  return growth > maxGrowth
    ? [`memory-growth: median memory rose ${(growth * 100).toFixed(0)}% from ${(early / 2 ** 20).toFixed(0)} MiB to ${(late / 2 ** 20).toFixed(0)} MiB`]
    : [];
}

export type Samples = Record<string, number[]>;

/** Gather per-page p95 across runs into sample arrays, the format of --record and --baseline files. */
export function collectSamples(runs: RunResult[]): Samples {
  const samples: Samples = {};
  for (const run of runs) {
    for (const [page, p95] of Object.entries(run.p95ByPage)) (samples[page] ??= []).push(Math.round(p95 * 10) / 10);
  }
  return samples;
}

/**
 * Soak drift: late-phase p95 against early-phase p95 for each page. One run
 * gives one value per phase, so this is a coarse guard (2x and at least
 * 20 ms worse), not a statistical verdict.
 */
export function soakDriftFindings(p95ByPage: Record<string, number>, factor = 2, minDeltaMs = 20): string[] {
  const findings: string[] = [];
  for (const [key, early] of Object.entries(p95ByPage)) {
    if (!key.endsWith("@early")) continue;
    const page = key.slice(0, -"@early".length);
    const late = p95ByPage[`${page}@late`];
    if (late !== undefined && late > early * factor && late - early >= minDeltaMs) {
      findings.push(`soak-drift: ${page}: p95 ${early.toFixed(1)} ms early -> ${late.toFixed(1)} ms late`);
    }
  }
  return findings;
}

export function baselineFindings(baseline: Samples, candidate: Samples): { findings: string[]; notes: string[] } {
  const findings: string[] = [];
  const notes: string[] = [];
  for (const [page, values] of Object.entries(candidate)) {
    const base = baseline[page];
    if (!base) {
      notes.push(`${page}: no baseline samples`);
      continue;
    }
    // 10 ms absolute floor: sub-10 ms p95 moves on a shared runner are not actionable.
    const result = compareSamples(base, values, { absoluteFloor: 10 });
    const line = `${page}: p95 median ${result.candidateMedian.toFixed(1)} ms vs ${result.baselineMedian.toFixed(1)} ms (band ±${Number.isNaN(result.band) ? "?" : result.band.toFixed(1)} ms): ${result.verdict}`;
    if (result.verdict === "regression") findings.push(`p95-regression: ${line}`);
    else notes.push(line);
  }
  return { findings, notes };
}

/* ---------------- orchestration ---------------- */

interface Options {
  image: string;
  script: string;
  rate: string;
  duration: string;
  runs: number;
  env: string[];
  record?: string;
  baseline?: string;
  expectFail: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { image: "", script: "reader.js", rate: "20", duration: "30s", runs: 1, env: [], expectFail: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--image") options.image = argv[++i];
    else if (arg === "--script") options.script = argv[++i];
    else if (arg === "--rate") options.rate = argv[++i];
    else if (arg === "--duration") options.duration = argv[++i];
    else if (arg === "--runs") options.runs = Number(argv[++i]);
    else if (arg === "--env") options.env.push(argv[++i]);
    else if (arg === "--record") options.record = argv[++i];
    else if (arg === "--baseline") options.baseline = argv[++i];
    else if (arg === "--expect-fail") options.expectFail = true;
  }
  if (!options.image) {
    console.error("usage: load-test.ts --image <image> [--script reader.js] [--rate N] [--duration 30s] [--runs N] [--env K=V]... [--record file] [--baseline file] [--expect-fail]");
    process.exit(2);
  }
  return options;
}

const docker = (args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(network: string, app: string, budgetMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    // Probe from inside the network so no host port is needed.
    const probe = spawnSync("docker", ["run", "--rm", "--network", network, "--entrypoint", "wget", K6_IMAGE, "-q", "-O", "-", `http://${app}:3000/healthz/live`], { encoding: "utf8" });
    if (probe.status === 0) return;
    const running = docker(["inspect", "--format", "{{.State.Running}}", app]);
    if (running !== "true") throw new Error(`${app} exited during startup:\n${spawnSync("docker", ["logs", app], { encoding: "utf8" }).stdout}`);
    await sleep(1000);
  }
  throw new Error(`${app} was not healthy within ${budgetMs} ms`);
}

async function runK6(options: Options, network: string, app: string, outDir: string, run: number): Promise<{ result: RunResult; memory: number[]; exitCode: number }> {
  const summaryName = `summary-${run}.json`;
  const args = [
    "run", "--rm", "--network", network,
    "--volume", `${join(REPO_ROOT, "tests/performance/k6")}:/scripts:ro`,
    "--volume", `${outDir}:/out`,
    "--env", `BASE_URL=http://${app}:3000`,
    "--env", `RATE=${options.rate}`,
    "--env", `DURATION=${options.duration}`,
    ...options.env.flatMap((pair) => ["--env", pair]),
    K6_IMAGE, "run", "--quiet", "--summary-export", `/out/${summaryName}`, `/scripts/${options.script}`
  ];
  const k6 = spawn("docker", args, { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  const memory: number[] = [];
  const sampler = setInterval(() => {
    const stats = spawnSync("docker", ["stats", "--no-stream", "--format", "{{.MemUsage}}", app], { encoding: "utf8" });
    const bytes = parseDockerMemory(stats.stdout);
    if (bytes !== undefined) memory.push(bytes);
  }, 5000);
  const exitCode: number = await new Promise((done) => k6.on("close", (code) => done(code ?? 1)));
  clearInterval(sampler);
  const summary: K6Summary = JSON.parse(readFileSync(join(outDir, summaryName), "utf8"));
  return { result: readK6Summary(summary), memory, exitCode };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const id = randomUUID().slice(0, 8);
  const network = `tutors-load-${id}`;
  const app = `tutors-load-app-${id}`;
  // Docker Desktop shares the user temp directory with its VM; CI runners share /tmp.
  const outDir = mkdtempSync(join(tmpdir(), "tutors-k6-"));
  const findings: string[] = [];
  const runs: RunResult[] = [];

  docker(["network", "create", network]);
  try {
    docker([
      "run", "--detach", "--name", app, "--network", network,
      "--user", "1000150000:0", "--read-only", "--tmpfs", "/tmp",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--env-file", join(REPO_ROOT, ".env.example"),
      "--env", "LOG_LEVEL=warn",
      "--env", "PUBLIC_ANON_MODE=TRUE",
      "--env", `ORIGIN=http://${app}:3000`,
      options.image
    ]);
    await waitHealthy(network, app);

    for (let run = 1; run <= options.runs; run++) {
      console.log(`--- k6 run ${run}/${options.runs}: ${options.script} at ${options.rate} rps for ${options.duration}`);
      const { result, memory, exitCode } = await runK6(options, network, app, outDir, run);
      runs.push(result);
      console.log(
        `run ${run}: ${result.requests} requests, error rate ${(result.errorRate * 100).toFixed(2)}%, p95 ` +
          Object.entries(result.p95ByPage).map(([page, p95]) => `${page} ${p95.toFixed(1)} ms`).join(", ") +
          (memory.length ? `, memory ${(Math.min(...memory) / 2 ** 20).toFixed(0)}-${(Math.max(...memory) / 2 ** 20).toFixed(0)} MiB` : "")
      );
      findings.push(...result.crossedThresholds.map((t) => `threshold: run ${run}: ${t}`));
      if (exitCode !== 0 && result.crossedThresholds.length === 0) findings.push(`k6: run ${run} exited with ${exitCode}`);
      findings.push(...memoryGrowthFindings(memory).map((f) => `run ${run}: ${f}`));
      findings.push(...soakDriftFindings(result.p95ByPage).map((f) => `run ${run}: ${f}`));
    }

    const samples = collectSamples(runs);
    if (options.record) {
      mkdirSync(resolve(options.record, ".."), { recursive: true });
      writeFileSync(resolve(options.record), JSON.stringify({ script: options.script, rate: options.rate, duration: options.duration, p95Ms: samples }, null, 2) + "\n");
      console.log(`recorded samples to ${options.record}`);
    }
    if (options.baseline) {
      const baseline = JSON.parse(readText(resolve(options.baseline))).p95Ms as Samples;
      const compared = baselineFindings(baseline, samples);
      compared.notes.forEach((note) => console.log(`baseline: ${note}`));
      findings.push(...compared.findings);
    }
  } finally {
    spawnSync("docker", ["rm", "--force", app], { stdio: "ignore" });
    spawnSync("docker", ["network", "rm", network], { stdio: "ignore" });
  }

  findings.forEach((finding) => console.log(`finding: ${finding}`));
  if (options.expectFail) {
    if (findings.length === 0) {
      console.error("expected the load test to fail, but every threshold held. The thresholds have lost their teeth.");
      process.exit(1);
    }
    console.log(`failed as expected (${findings.length} finding(s)).`);
  } else if (findings.length > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
