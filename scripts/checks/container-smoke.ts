/**
 * Container smoke test (runway tiers J and K against the built artefact).
 *
 *   pnpm check:container --image tutors/reader:local
 *   pnpm check:container --image tutors-fixture --env FIXTURE_FAULT=readonly --expect-fail
 *
 * Runs the image the way OpenShift's restricted SCC would — an arbitrary
 * non-root UID in group 0, read-only root filesystem, no capabilities — with
 * only the placeholder values from .env.example, then checks:
 *   - /healthz/live answers 200 within the startup budget
 *   - /metrics serves every series the Grafana alert rules query
 *   - a request carrying x-request-id is echoed and logged with that id
 *   - every log line is JSON and matches the log schema and the log contract
 *     (core keys in order, per-event field sets), including the lines of a 404
 *   - a request without x-request-id gets a generated UUID, logged on its lines
 *   - /metrics exports exactly the pinned app-level series plus process_/nodejs_
 *   - two identical requests answer identical headers, Date and x-request-id aside
 *   - /version answers the documented shape, on the system clock
 *
 * With `--app <name>` it also checks tier M against the image: the response
 * header contract (tests/security/header-contract.json), no 5xx on the probed
 * paths (known gaps for both ratcheted by known-response-gaps.txt), cookie
 * flags, and that every mutating route in tests/security/mutating-routes.txt
 * rejects a cross-site form post.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  alertParityFindings,
  containerLogFindings,
  logSchemaFindings,
  metricsContractFindings,
  parseLogStream,
  requestCorrelationFindings,
  type LogLine
} from "./observability.ts";
import { REPO_ROOT, readBaseline, readText } from "./lib/repo.ts";
import { describeRatchet, ratchet } from "./lib/ratchet.ts";
import { cookieFindings, headerFindings, loadHeaderContract, parseInventory } from "./security.ts";

interface Options {
  image: string;
  app?: string;
  env: string[];
  startupBudgetMs: number;
  expectFail: boolean;
  keep: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { image: "", env: [], startupBudgetMs: 30_000, expectFail: false, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--image") options.image = argv[++i];
    else if (arg === "--app") options.app = argv[++i];
    else if (arg === "--env") options.env.push(argv[++i]);
    else if (arg === "--startup-budget-ms") options.startupBudgetMs = Number(argv[++i]);
    else if (arg === "--expect-fail") options.expectFail = true;
    else if (arg === "--keep") options.keep = true;
  }
  if (!options.image) {
    console.error("usage: container-smoke.ts --image <image> [--app <name>] [--env KEY=VALUE]... [--startup-budget-ms N] [--expect-fail] [--keep]");
    process.exit(2);
  }
  return options;
}

const docker = (args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, init: Parameters<typeof fetch>[1] = {}, timeoutMs = 3000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

async function run(options: Options): Promise<string[]> {
  const findings: string[] = [];
  // OpenShift picks a UID from the namespace range; anything but the image's own 1001 proves the image doesn't depend on it.
  const uid = randomInt(1_000_100_000, 1_000_199_999);
  const name = `tutors-smoke-${randomUUID().slice(0, 8)}`;

  const args = [
    "run", "--detach", "--name", name,
    "--user", `${uid}:0`,
    "--read-only", "--tmpfs", "/tmp",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--env-file", join(REPO_ROOT, ".env.example"),
    "--env", "LOG_LEVEL=info",
    "--publish", "127.0.0.1::3000"
  ];
  for (const pair of options.env) args.push("--env", pair);
  args.push(options.image);

  docker(args);
  try {
    const started = Date.now();
    let live = false;
    let base = "";
    while (Date.now() - started < options.startupBudgetMs) {
      const [running, exitCode] = docker(["inspect", "--format", "{{.State.Running}} {{.State.ExitCode}}", name]).split(" ");
      if (running !== "true") {
        findings.push(`startup: container exited with code ${exitCode} (uid ${uid}, read-only root)`);
        return findings;
      }
      try {
        // Docker only reports the published port once the container is running.
        base ||= `http://127.0.0.1:${docker(["port", name, "3000/tcp"]).split("\n")[0].split(":").pop()}`;
        const response = await fetchWithTimeout(`${base}/healthz/live`);
        if (response.status === 200) {
          live = true;
          break;
        }
      } catch {
        // not listening yet
      }
      await sleep(500);
    }
    if (!live) {
      findings.push(`healthz: /healthz/live did not answer 200 within ${options.startupBudgetMs} ms (uid ${uid}, read-only root)`);
      return findings;
    }
    console.log(`live after ${Date.now() - started} ms as uid ${uid}`);

    const requestId = `smoke-${randomUUID()}`;
    const home = await fetchWithTimeout(`${base}/`, { headers: { "x-request-id": requestId } }, 15_000);
    if (home.status >= 500) findings.push(`request: GET / returned ${home.status}`);
    if (home.headers.get("x-request-id") !== requestId) {
      findings.push(`request-id: response did not echo x-request-id (got ${home.headers.get("x-request-id")})`);
    }

    // No id from the caller, and a path no route matches: an error line and a completion line, one generated id.
    const missingPath = `/smoke-missing-${randomUUID().slice(0, 8)}/x/y/z`;
    const missing = await fetchWithTimeout(`${base}${missingPath}`, {}, 15_000);
    const generatedId = missing.headers.get("x-request-id");
    // The same with the caller's id. Unique paths, so every line about them belongs to exactly one request.
    const tracedPath = `/smoke-traced-${randomUUID().slice(0, 8)}/x/y/z`;
    const tracedId = `smoke-${randomUUID()}`;
    const traced = await fetchWithTimeout(`${base}${tracedPath}`, { headers: { "x-request-id": tracedId } }, 15_000);

    const metrics = await fetchWithTimeout(`${base}/metrics`);
    if (metrics.status !== 200) {
      findings.push(`metrics: GET /metrics returned ${metrics.status}`);
    } else {
      const alerts = readText(join(REPO_ROOT, "observability/grafana/provisioning/alerting/alerts.yml"));
      const exposition = await metrics.text();
      findings.push(...alertParityFindings(alerts, exposition).map((f) => `metrics: ${f}`));
      findings.push(...metricsContractFindings(exposition).map((f) => `metrics: ${f}`));
    }

    findings.push(...(await determinismFindings(base)));

    if (options.app) findings.push(...(await securityFindings(options.app, base)));

    // Give the logger a moment to flush the completion line.
    await sleep(500);
    const logs = spawnSync("docker", ["logs", name], { encoding: "utf8" });
    const { lines, findings: parseFindings } = parseLogStream(`${logs.stdout}\n${logs.stderr}`);
    findings.push(...parseFindings.map((f) => `logs: ${f}`));
    findings.push(...logSchemaFindings(lines).map((f) => `logs: ${f}`));
    findings.push(...containerLogFindings(lines).map((f) => `logs: ${f}`));
    const entries = lines as LogLine[];
    findings.push(...requestCorrelationFindings("request-id", tracedId, traced.headers.get("x-request-id"), entries, tracedPath));
    findings.push(...requestCorrelationFindings("request-id", undefined, generatedId, entries, missingPath));
    if (!entries.some((line) => line.message === "Service starting")) findings.push("logs: no \"Service starting\" line");
    if (!entries.some((line) => line.message === "request completed" && line.requestId === requestId)) {
      findings.push(`logs: no "request completed" line carrying request id ${requestId}`);
    }
    return findings;
  } finally {
    if (findings.length > 0 || options.keep) {
      console.log("--- container logs ---");
      console.log(spawnSync("docker", ["logs", "--tail", "50", name], { encoding: "utf8" }).stdout);
    }
    if (!options.keep) spawnSync("docker", ["rm", "--force", name], { stdio: "ignore" });
  }
}

/**
 * Headers that legitimately differ between two identical requests. The release
 * harness masks exactly these; anything else that varies is permanent noise in
 * every release comparison.
 */
const VOLATILE_HEADERS = new Set(["date", "x-request-id"]);
const VERSION_KEYS = ["app", "built", "clock", "revision", "version"];

/** Same request twice gives the same headers, and build identity is answered by /version in the documented shape. */
async function determinismFindings(base: string): Promise<string[]> {
  const findings: string[] = [];
  for (const path of ["/", "/favicon.png", "/healthz/live", "/version"]) {
    const [first, second] = [await fetchWithTimeout(`${base}${path}`, {}, 15_000), await fetchWithTimeout(`${base}${path}`, {}, 15_000)];
    await Promise.all([first.arrayBuffer(), second.arrayBuffer()]);
    const names = new Set([...first.headers.keys(), ...second.headers.keys()]);
    for (const name of [...names].filter((n) => !VOLATILE_HEADERS.has(n)).sort()) {
      if (first.headers.get(name) !== second.headers.get(name)) {
        findings.push(`determinism: GET ${path}: header ${name} differs between two identical requests (${first.headers.get(name)} / ${second.headers.get(name)})`);
      }
    }
  }

  const version = await fetchWithTimeout(`${base}/version`);
  if (version.status !== 200) {
    findings.push(`version: GET /version returned ${version.status}`);
  } else {
    const body = (await version.json()) as Record<string, unknown>;
    const keys = Object.keys(body).sort();
    if (keys.join() !== VERSION_KEYS.join()) findings.push(`version: GET /version keys are [${keys}], expected [${VERSION_KEYS}]`);
    if (Object.values(body).some((value) => typeof value !== "string" || value === "")) findings.push("version: GET /version has a non-string or empty field");
    if (body.clock !== "system") findings.push(`version: clock is "${body.clock}"; an image started without HARNESS_NOW must run on the system clock`);
  }
  return findings;
}

const RESPONSE_GAPS ="tests/security/known-response-gaps.txt";

/** Tier M against the running image: header contract, cookie flags and CSRF on mutating routes. */
async function securityFindings(app: string, base: string): Promise<string[]> {
  const findings: string[] = [];
  const contract = loadHeaderContract();
  const paths = contract.apps[app]?.paths;
  if (!paths) return [`security: no entry for "${app}" in tests/security/header-contract.json`];

  const gaps = new Set<string>();
  const cookies = new Set<string>();
  for (const path of paths) {
    // As the router would forward it, so Auth.js issues the cookies it would issue in production.
    const response = await fetchWithTimeout(`${base}${path}`, { redirect: "manual", headers: { "x-forwarded-proto": "https" } }, 15_000);
    if (response.status >= 500) gaps.add(`server-error: ${app}: GET ${path}`);
    headerFindings(app, response.headers, contract).forEach((gap) => gaps.add(gap));
    cookieFindings(app, response.headers.getSetCookie(), { https: true }).forEach((f) => cookies.add(f));
  }
  const known = readBaseline(join(REPO_ROOT, RESPONSE_GAPS)).filter((line) => line.includes(`: ${app}: `));
  const result = ratchet(gaps, known);
  if (result.added.length > 0 || result.stale.length > 0) {
    findings.push(`security: ${describeRatchet("response contract", RESPONSE_GAPS, result)}`);
  }
  findings.push(...[...cookies].map((f) => `security: ${f}`));

  const inventory = parseInventory(readText(join(REPO_ROOT, "tests/security/mutating-routes.txt")));
  for (const entry of inventory.filter((e) => e.key.startsWith(`${app} `))) {
    const [, method, route] = entry.key.split(" ");
    const path = route.replace(/\[[^\]]+\]/g, "runway");
    // SvelteKit refuses cross-site form submissions before any hook or handler runs.
    const response = await fetchWithTimeout(
      `${base}${path}`,
      {
        method,
        redirect: "manual",
        headers: { origin: "https://attacker.example", "content-type": "application/x-www-form-urlencoded" },
        body: "runway=csrf"
      },
      15_000
    );
    if (response.status !== 403) {
      findings.push(`security: ${method} ${path} answered a cross-site form post with ${response.status}, expected 403`);
    }
  }
  return findings;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const findings = await run(options);

  for (const finding of findings) console.log(`finding: ${finding}`);
  if (options.expectFail) {
    if (findings.length === 0) {
      console.error(`${options.image}: expected the smoke test to fail, but it passed. The check has lost its teeth.`);
      process.exit(1);
    }
    console.log(`${options.image}: failed as expected (${findings.length} finding(s)).`);
  } else if (findings.length > 0) {
    console.error(`${options.image}: ${findings.length} finding(s).`);
    process.exit(1);
  } else {
    console.log(`${options.image}: ok`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
