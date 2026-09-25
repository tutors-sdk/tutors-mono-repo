/**
 * What browser code may still do with the anon Supabase client, now that student data goes through
 * the data API (@tutors/data-api, guides/SERVER-WRITES.md): read the public tables, report errors,
 * and call the two aggregate functions. Anything else (a write, a read of a personal table, another
 * RPC) belongs behind a data API route. Realtime channels are not table access and are not checked.
 *
 * Lexical, like the other checks: it finds `.from("table")` and `.rpc("fn")` calls in browser code
 * (everything under packages/svelte and apps/<app>/src except server-only files) and reads the
 * method chained after each `.from(...)`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO_ROOT } from "./lib/repo.ts";

/** Tables browser code may read, and what else it may do to them. */
export const BROWSER_TABLES: Readonly<Record<string, readonly string[]>> = {
  "tutors-connect-courses": ["select"],
  "tutors-connect-latest": ["select"],
  tutors_content_locks: ["select"],
  app_errors: ["insert"]
};

/** Database functions browser code may call: aggregates only. */
export const BROWSER_RPCS: readonly string[] = ["get_student_count", "get_error_counts"];

/** Server-only files: SvelteKit never bundles them for the browser. */
const SERVER_ONLY = /(^|\/)(lib\/server\/|hooks\.server\.ts$|\+server\.ts$|\+page\.server\.ts$|\+layout\.server\.ts$)/;

export interface DataAccessFinding {
  file: string;
  line: number;
  message: string;
}

/** Findings in one browser file's source. */
export function scanBrowserSource(file: string, source: string): DataAccessFinding[] {
  const findings: DataAccessFinding[] = [];
  const lineOf = (index: number) => source.slice(0, index).split("\n").length;
  for (const m of source.matchAll(/\.from\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*(\w+)\s*\(/g)) {
    const [, table, method] = m;
    const allowed = BROWSER_TABLES[table];
    if (!allowed) findings.push({ file, line: lineOf(m.index), message: `reads "${table}" from the browser; personal data goes through @tutors/data-api` });
    else if (!allowed.includes(method)) findings.push({ file, line: lineOf(m.index), message: `calls .${method}() on "${table}" from the browser; only ${allowed.join(", ")} is allowed, the rest goes through @tutors/data-api` });
  }
  for (const m of source.matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]/g)) {
    if (!BROWSER_RPCS.includes(m[1])) findings.push({ file, line: lineOf(m.index), message: `calls the database function "${m[1]}" from the browser; only ${BROWSER_RPCS.join(", ")} are allowed` });
  }
  return findings;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".svelte-kit" || entry === "build" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|svelte)$/.test(entry) && !/\.(test|spec)\.ts$/.test(entry)) out.push(path);
  }
}

/** Every finding in the repository's browser code. */
export function scanBrowserCode(root: string = REPO_ROOT): DataAccessFinding[] {
  const files: string[] = [];
  walk(join(root, "packages/svelte"), files);
  for (const app of readdirSync(join(root, "apps"))) walk(join(root, "apps", app, "src"), files);
  return files
    .map((path) => relative(root, path))
    .filter((file) => !SERVER_ONLY.test(file))
    .flatMap((file) => scanBrowserSource(file, readFileSync(join(root, file), "utf8")));
}
