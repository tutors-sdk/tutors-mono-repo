import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the monorepo root. */
export const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

const SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".svelte-kit",
  "build",
  "dist",
  "coverage",
  ".git",
  "reports",
  "playwright-report",
  "test-results"
]);

/** Path relative to `from` with forward slashes, stable across platforms. */
export function toPosix(path: string, from: string = REPO_ROOT): string {
  return relative(from, path).split(sep).join("/");
}

/**
 * Walk `dir` and return absolute paths of files whose name passes `accept`.
 * Dependencies, build output, caches and dot-directories (`.git`, `.claude`
 * worktrees, editor state) are never visited.
 */
export function walk(dir: string, accept: (name: string) => boolean, skip: ReadonlySet<string> = SKIP_DIRS): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!skip.has(name) && !name.startsWith(".")) out.push(...walk(full, accept, skip));
    } else if (accept(name)) {
      out.push(full);
    }
  }
  return out;
}

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

/** One entry per line; `#` comments and blank lines are ignored. */
export function readBaseline(path: string): string[] {
  return readText(path)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
