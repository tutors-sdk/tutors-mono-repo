/**
 * Built-server smoke test (runway tier J, without Docker).
 *
 *   SVELTEKIT_ADAPTER=node pnpm --filter "tutors-reader..." build
 *   pnpm check:server                    # every app with a build; missing builds fail
 *   pnpm check:server --apps reader      # just these
 *
 * Two checks against what adapter-node emitted for each app:
 *
 *   1. esm-global: no file under build/server uses `__dirname` or `__filename`
 *      without declaring it. The server bundle is ES modules, where both are
 *      undefined; a dependency that reaches them (jsdom, through
 *      isomorphic-dompurify, in v16.2.0) throws the first time a route
 *      imports it. Static, so it names the chunk.
 *   2. http-5xx: `node build/index.js` is started with only the placeholder
 *      values from .env.example and PUBLIC_ANON_MODE=FALSE (Auth.js on), and
 *      every path in tests/security/header-contract.json for the app must
 *      answer below 500. That list includes /auth and /auth/<courseid>, which
 *      answered 500 on the v16.2.0 reader image. Dynamic, so it also catches
 *      failures the static scan cannot see (a missing module, a bad import).
 *
 * The container smoke test (check:container) proves the same against the
 * image; this one needs only a build, so it runs in the bundle-budgets job and
 * on a laptop.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { REPO_ROOT, readText, toPosix, walk } from "./lib/repo.ts";
import { loadHeaderContract } from "./security.ts";

export const SERVER_OUTPUT = "build";

const CJS_GLOBALS = ["__dirname", "__filename"] as const;

/**
 * Findings for one JS file: `esm-global: <file>: <name> ...` for every
 * CommonJS global it uses that is neither guarded by `typeof` nor declared in
 * the file (a bundler shim such as `const __dirname = dirname(fileURLToPath(...))`).
 */
export function esmGlobalFindings(file: string, source: string): string[] {
  const findings: string[] = [];
  for (const name of CJS_GLOBALS) {
    if (!source.includes(name)) continue;
    const declared = new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`);
    if (declared.test(source)) continue;
    const use = new RegExp(`(?<!typeof\\s)(?<![\\w$.])${name}(?![\\w$])`);
    if (use.test(source)) findings.push(`esm-global: ${file}: ${name} is not defined in ES module scope`);
  }
  return findings;
}

export function scanServerBundle(app: string, serverDir: string): string[] {
  return walk(serverDir, (name) => /\.m?js$/.test(name), new Set(["node_modules"])).flatMap((path) =>
    esmGlobalFindings(`${app}: ${toPosix(path, serverDir)}`, readFileSync(path, "utf8"))
  );
}

/** KEY=VALUE lines of a dotenv file; blank values and comments are dropped. */
export function parseEnvFile(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && match[2] !== "") env[match[1]] = match[2];
  }
  return env;
}

/** Statuses at or above 500 become `http-5xx: <app>: GET <path> answered <status>`. */
export function statusFindings(app: string, results: { path: string; status: number }[]): string[] {
  return results.filter((r) => r.status >= 500).map((r) => `http-5xx: ${app}: GET ${r.path} answered ${r.status}`);
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function get(url: string, timeoutMs = 15_000): Promise<number> {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  await response.arrayBuffer();
  return response.status;
}

async function probeApp(app: string, appDir: string, paths: string[], startupBudgetMs = 30_000): Promise<string[]> {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const output: string[] = [];
  const child: ChildProcess = spawn(process.execPath, [join(appDir, SERVER_OUTPUT, "index.js")], {
    cwd: appDir,
    env: {
      ...process.env,
      ...parseEnvFile(readText(join(REPO_ROOT, ".env.example"))),
      // Auth.js on: the anonymous mode never reaches the sign-in code paths.
      PUBLIC_ANON_MODE: "FALSE",
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      ORIGIN: base
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.on("data", (chunk) => output.push(String(chunk)));
  child.stderr?.on("data", (chunk) => output.push(String(chunk)));
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  try {
    const started = Date.now();
    let live = false;
    while (!exited && Date.now() - started < startupBudgetMs) {
      try {
        if ((await get(`${base}/healthz/live`, 3000)) === 200) {
          live = true;
          break;
        }
      } catch {
        // not listening yet
      }
      await sleep(250);
    }
    if (!live) {
      const tail = output.join("").trim().split("\n").slice(-3).join(" | ");
      return [`startup: ${app}: /healthz/live did not answer 200 within ${startupBudgetMs} ms${exited ? " (server exited)" : ""}: ${tail}`];
    }
    const results: { path: string; status: number }[] = [];
    for (const path of paths) results.push({ path, status: await get(`${base}${path}`) });
    for (const r of results) process.stdout.write(`${app.padEnd(10)} GET ${r.path.padEnd(28)} ${r.status}\n`);
    return statusFindings(app, results);
  } finally {
    child.kill();
  }
}

async function main(argv: string[]) {
  const contract = loadHeaderContract();
  const appsIndex = argv.indexOf("--apps");
  const apps = appsIndex >= 0 ? argv[appsIndex + 1].split(",") : Object.keys(contract.apps);
  const findings: string[] = [];

  for (const app of apps) {
    const appDir = join(REPO_ROOT, "apps", app);
    const serverDir = join(appDir, SERVER_OUTPUT, "server");
    if (!existsSync(serverDir)) {
      findings.push(`not-built: ${app}: ${toPosix(serverDir)} is missing (SVELTEKIT_ADAPTER=node pnpm --filter "tutors-${app}..." build)`);
      continue;
    }
    const paths = contract.apps[app]?.paths;
    if (!paths) {
      findings.push(`no-paths: ${app}: add it to tests/security/header-contract.json`);
      continue;
    }
    const scan = scanServerBundle(app, serverDir);
    findings.push(...scan);
    if (scan.length === 0) process.stdout.write(`${app.padEnd(10)} no CommonJS globals in ${toPosix(serverDir)}\n`);
    findings.push(...(await probeApp(app, appDir, paths)));
  }

  for (const finding of findings) {
    process.stdout.write(`${finding}\n`);
    if (process.env.GITHUB_ACTIONS) process.stdout.write(`::error file=scripts/checks/server-smoke.ts::${finding}\n`);
  }
  if (findings.length > 0) process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${inspect(error)}\n`);
    process.exit(1);
  });
}
