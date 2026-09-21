/**
 * Build identity stays on one endpoint (release-harness determinism).
 *
 *   SVELTEKIT_ADAPTER=node GIT_SHA=<sha> pnpm --filter "tutors-<app>..." build
 *   pnpm check:build-identity                 # every app with a build; missing builds fail
 *   pnpm check:build-identity --apps reader   # just these
 *
 * The commit and build date of an image are answered by `GET /version` and by
 * nothing else, so a release comparison masks exactly one route instead of
 * chasing the sha through HTML, headers and bundles. This check starts each
 * built server (`apps/<app>/build`, no Docker) with a sentinel commit and build
 * date, then looks for them, and for the release version, everywhere else it
 * can practically reach:
 *
 *   - every response header of every probed route (home, error page, health,
 *     metrics, /_app/version.json, static files),
 *   - every HTML body, and every script, stylesheet, manifest and icon it links,
 *   - every file SvelteKit built into `build/`.
 *
 * The release version is a build-dependent string too, but one the UI shows on
 * purpose (the footer). It may appear only inside an element marked
 * `data-tutors-build="version"`, so the comparison can mask it, and in the
 * client bundle that footer is compiled into.
 *
 * `container-smoke.ts` runs the same crawl against a running image, taking the
 * identity from that image's own `/version`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, readText, toPosix, walk } from "./lib/repo.ts";

/** The apps that ship as images, and so must each answer `GET /version`. */
export const APPS = ["reader", "catalogue", "live", "time"] as const;

export interface BuildIdentity {
  /** Git commit: `GIT_SHA`, answered as `revision`. */
  revision: string;
  /** Build date: `BUILD_DATE`, answered as `built`. */
  built: string;
  /** Release version, from package.json. */
  version: string;
}

type BodyKind = "html" | "asset" | "other";

/** One response the crawl saw. */
export interface Sample {
  path: string;
  status: number;
  /** Header name and value pairs, exactly as the server sent them. */
  headers: [string, string][];
  /** Text of the body; empty for binary responses. */
  body: string;
  kind: BodyKind;
}

/** Elements that carry the version on purpose, so a comparison can mask them. */
const VERSION_MARKER = /<(\w+)\b[^>]*\bdata-tutors-build="version"[^>]*>[\s\S]*?<\/\1>/g;

/** `body` with the elements that carry the version on purpose cut out by position (no pattern substitution, so nothing is left half-removed). */
function outsideMarkers(body: string): string {
  let out = "";
  let last = 0;
  for (const marked of body.matchAll(VERSION_MARKER)) {
    out += body.slice(last, marked.index);
    last = marked.index + marked[0].length;
  }
  return out + body.slice(last);
}

/** A version number is only itself when it is not part of a longer one (`116.2.20`, `1.2.3.4`). */
const versionPattern = (version: string): RegExp => new RegExp(`(?<![\\d.])${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d.])`);

/** Strings whose presence outside `/version` is a leak: the commit, its short form, and the build date. */
function secrets(identity: BuildIdentity): string[] {
  return [...new Set([identity.revision, identity.revision.slice(0, 12), identity.built].filter((s) => s.length >= 8 && s !== "unknown"))];
}

/** The secrets present in `text`; a short form is not reported when the full commit that contains it is. */
function found(text: string, identity: BuildIdentity): string[] {
  const present = secrets(identity).filter((secret) => text.includes(secret));
  return present.filter((secret) => !present.some((other) => other !== secret && other.includes(secret)));
}

/**
 * What in one response gives the build identity away. `/version` itself is the
 * one route allowed to; everything else is reported with where it was found.
 */
export function identityLeaks(sample: Sample, identity: BuildIdentity): string[] {
  if (sample.path === "/version") return [];
  const findings: string[] = [];
  const headerText = sample.headers.map(([name, value]) => `${name}: ${value}`).join("\n");
  const version = versionPattern(identity.version);
  for (const secret of found(headerText, identity)) findings.push(`GET ${sample.path}: a response header carries "${secret}"`);
  for (const secret of found(sample.body, identity)) findings.push(`GET ${sample.path}: the ${sample.kind === "html" ? "page" : "body"} carries "${secret}"`);
  if (version.test(headerText)) findings.push(`GET ${sample.path}: a response header carries the release version ${identity.version}`);
  // Scripts and styles are compiled from the footer, which shows the version; only pages must mark it.
  if (sample.kind !== "asset" && version.test(outsideMarkers(sample.body))) {
    findings.push(`GET ${sample.path}: the ${sample.kind === "html" ? "page" : "body"} carries the release version ${identity.version} outside data-tutors-build="version"`);
  }
  return findings;
}

/** Same-origin URLs a page links to: scripts, stylesheets, preloads, the manifest and icons. */
export function linkedAssets(html: string): string[] {
  const found = new Set<string>();
  for (const [, tag] of html.matchAll(/<(?:script|link)\b([^>]*)>/gi)) {
    const url = /\b(?:src|href)="([^"]+)"/.exec(tag)?.[1];
    const rel = /\brel="([^"]+)"/.exec(tag)?.[1] ?? "";
    if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) continue;
    if (/\bsrc=/.test(tag) || /(?:stylesheet|modulepreload|preload|manifest|icon)/.test(rel)) found.add(url.startsWith("/") ? url : `/${url.replace(/^\.\//, "")}`);
  }
  return [...found];
}

/** The routes every app answers that could plausibly echo build identity. */
const PROBED_PATHS = [
  "/",
  "/version",
  "/healthz",
  "/healthz/live",
  "/metrics",
  "/_app/version.json",
  "/robots.txt",
  "/manifest.webmanifest",
  "/favicon.png",
  "/favicon.ico",
  // No route matches, so this is the error page.
  "/build-identity-probe/does/not/exist"
];

const kindOf = (path: string, contentType: string): BodyKind => {
  if (contentType.includes("text/html")) return "html";
  return /\.(?:m?js|css|json|webmanifest|svg)$/.test(path) || /javascript|css|manifest/.test(contentType) ? "asset" : "other";
};

async function sampleOf(base: string, path: string): Promise<Sample> {
  const response = await fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  const contentType = response.headers.get("content-type") ?? "";
  const binary = /^(?:image|font|audio|video)\//.test(contentType) && !contentType.includes("svg");
  const body = binary ? "" : await response.text();
  if (binary) await response.arrayBuffer();
  return { path, status: response.status, headers: [...response.headers.entries()], body, kind: kindOf(path, contentType) };
}

/** Fetch the probed routes and everything the pages link, from a running server. */
export async function crawl(base: string, extraPaths: string[] = []): Promise<Sample[]> {
  const samples: Sample[] = [];
  const seen = new Set<string>();
  const queue = [...PROBED_PATHS, ...extraPaths];
  while (queue.length > 0 && seen.size < 120) {
    const path = queue.shift() as string;
    if (seen.has(path)) continue;
    seen.add(path);
    const sample = await sampleOf(base, path);
    samples.push(sample);
    if (sample.kind === "html") queue.push(...linkedAssets(sample.body));
  }
  return samples;
}

/** `/version` must exist on the app and answer the identity the caller expects, if it expects one. */
export function versionFindings(sample: Sample | undefined, expected?: Partial<BuildIdentity>): string[] {
  if (!sample) return ["version: GET /version was not probed"];
  if (sample.status !== 200) return [`version: GET /version returned ${sample.status}`];
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(sample.body);
  } catch {
    return ["version: GET /version did not answer JSON"];
  }
  const findings: string[] = [];
  if (expected?.revision !== undefined && body.revision !== expected.revision) findings.push(`version: revision is "${body.revision}", expected "${expected.revision}"`);
  if (expected?.built !== undefined && body.built !== expected.built) findings.push(`version: built is "${body.built}", expected "${expected.built}"`);
  if (expected?.version !== undefined && body.version !== expected.version) findings.push(`version: version is "${body.version}", expected "${expected.version}"`);
  return findings;
}

/** Crawl a running server and report every place it gives its identity away. Identity is read from its own `/version`. */
export async function buildIdentityFindings(base: string): Promise<string[]> {
  const samples = await crawl(base);
  const version = samples.find((s) => s.path === "/version");
  const findings = versionFindings(version);
  if (findings.length > 0 || !version) return findings;
  const body = JSON.parse(version.body) as Record<string, string>;
  const identity: BuildIdentity = { revision: body.revision, built: body.built, version: body.version };
  // An image built without GIT_SHA and BUILD_DATE answers "unknown"; only the release version can be searched for then.
  return samples.flatMap((sample) => identityLeaks(sample, identity)).map((f) => `identity: ${f}`);
}

/** Every file SvelteKit built for the app, searched for the sentinels. Text files only; binaries cannot hold them by accident. */
export function buildOutputFindings(app: string, identity: BuildIdentity, root: string = REPO_ROOT): string[] {
  const dir = join(root, "apps", app, "build");
  const files = walk(dir, (name) => /\.(?:m?js|css|html|json|map|txt|webmanifest|svg)$/.test(name), new Set(["node_modules"]));
  const findings: string[] = [];
  for (const file of files) {
    const text = readText(file);
    for (const secret of found(text, identity)) findings.push(`build: ${toPosix(file, root)} contains "${secret}"`);
  }
  return findings;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function serve(app: string, env: Record<string, string>): Promise<{ base: string; child: ChildProcess; output: () => string }> {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, ["build/index.js"], {
    cwd: join(REPO_ROOT, "apps", app),
    env: { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port), ORIGIN: base, PUBLIC_ANON_MODE: "TRUE", LOG_LEVEL: "error", ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`${app} exited with code ${child.exitCode}\n${output}`);
    try {
      if ((await fetch(`${base}/healthz/live`, { signal: AbortSignal.timeout(1000) })).status === 200) return { base, child, output: () => output };
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill();
  throw new Error(`${app} did not answer /healthz/live within 30 s\n${output}`);
}

async function main(): Promise<number> {
  const flag = process.argv.indexOf("--apps");
  const apps = flag > 0 ? process.argv[flag + 1].split(",") : [...APPS];
  const version = JSON.parse(readText(join(REPO_ROOT, "package.json"))).version as string;
  // The sentinels are unmistakable and unlike anything a bundle contains by chance. The commit must also
  // be the one the build was given, or the search of build/ proves nothing about the bake.
  const identity: BuildIdentity = {
    revision: process.env.GIT_SHA && process.env.GIT_SHA !== "unknown" ? process.env.GIT_SHA : "f00dcafe5eed1e55ab1e0ddba11c0ffeedeadd0c",
    built: "2031-02-03T04:05:06Z",
    version
  };
  let failed = false;
  for (const app of apps) {
    const findings: string[] = [];
    if (!existsSync(join(REPO_ROOT, "apps", app, "build", "index.js"))) {
      findings.push(`no build: run SVELTEKIT_ADAPTER=node GIT_SHA=${identity.revision} pnpm --filter "tutors-${app}..." build`);
    } else {
      findings.push(...buildOutputFindings(app, identity));
      const { base, child, output } = await serve(app, { GIT_SHA: identity.revision, BUILD_DATE: identity.built });
      try {
        const samples = await crawl(base);
        findings.push(...versionFindings(samples.find((s) => s.path === "/version"), identity));
        findings.push(...samples.flatMap((sample) => identityLeaks(sample, identity)).map((f) => `identity: ${f}`));
        process.stdout.write(`${app}: ${samples.length} responses checked
`);
      } catch (error) {
        findings.push(`crawl: ${error instanceof Error ? error.message : String(error)}\n${output()}`);
      } finally {
        child.kill();
      }
    }
    if (findings.length > 0) failed = true;
    for (const finding of findings) process.stderr.write(`${app}: ${finding}
`);
  }
  process.stdout.write(`${failed ? "build identity: FAILED" : "build identity: only GET /version answers the commit and build date"}
`);
  return failed ? 1 : 0;
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}
`);
      process.exit(2);
    }
  );
}
