/**
 * The CHANGELOG hint check (Rules 0664-0666): a pull request's artefact hint, `fix(reader): x (persistence, sbom)`,
 * is what the release harness reads to count a difference as declared rather than owed
 * (CONTRIBUTING.md#changelog-entries). The hint is written from memory, so this reads the diff and names the
 * artefacts it is certain to move:
 *
 *   sbom            a production dependency of an app or a package (`dependencies` in its package.json)
 *   image-manifest  an instruction in a Dockerfile (comments and blank lines aside)
 *   logs            a new `log.error`, `log.warn`, `logger.error` or `logger.warn` call in an app's or a package's source
 *
 * It only adds: an artefact the author declared stays declared, whether the diff shows it or not. The harness reads
 * the title's hint first, else the body's CHANGELOG line, so the fixed hint goes on the title and carries the line's
 * artefacts with it. On 20 Oct 2026 the forecast owed 19 differences because #518 and #519 moved @supabase/* between
 * the reader's and time's images and wrote only (persistence).
 *
 *   PR_TITLE=... PR_BODY=... pnpm check:changelog-hint --base <sha> --head <sha>
 *
 * Prints what it found. In GitHub Actions it writes `missing` (comma-separated, empty when nothing is missing),
 * `title` (the title to use) and `because` to $GITHUB_OUTPUT; .github/workflows/changelog-hint.yml acts on them.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ARTEFACTS } from "./release-claims.ts";
import { REPO_ROOT } from "./lib/repo.ts";

export interface FileChange {
  /** Repo-relative, forward slashes. */
  path: string;
  /** The file at the base; null when the pull request adds it. */
  before: string | null;
  /** The file at the head; null when the pull request deletes it. */
  after: string | null;
}

export interface Requirement {
  artefact: "sbom" | "image-manifest" | "logs";
  /** One reason, in words, naming the file. */
  because: string;
}

/** Where a pull request comes from: a fork's token, and a bot's, cannot edit its title. */
export interface Origin {
  fork: boolean;
  bot: boolean;
}

export type Action = "edit" | "fail" | "warn" | "pass";

const MANIFEST = /^(apps\/[^/]+|packages\/.+)\/package\.json$/;
const DOCKERFILE = /(^|\/)Dockerfile[^/]*$/;
const SOURCE = /^(apps\/[^/]+|packages\/.+)\/src\/.+\.(ts|js|svelte)$/;
const TEST = /(\.(test|spec)\.[a-z]+$)|(\/(tests?|e2e|__tests__)\/)/;
const LOG_CALL = /\blog(?:ger)?\.(?:error|warn)\s*\(/;
const HINT = /\s*\(([a-z-]+(?:\s*,\s*[a-z-]+)*)\)\s*$/;

function dependencies(text: string | null): string {
  if (text === null) return "{}";
  try {
    const deps = (JSON.parse(text) as { dependencies?: Record<string, string> }).dependencies ?? {};
    return JSON.stringify(
      Object.keys(deps)
        .sort()
        .map((name) => [name, deps[name]])
    );
  } catch {
    return text;
  }
}

const instructions = (text: string | null) =>
  (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join("\n");

/** Lines of `after` that `before` does not have, as many times as they were added. */
function addedLines(before: string | null, after: string | null): string[] {
  const left = new Map<string, number>();
  for (const line of (before ?? "").split(/\r?\n/)) left.set(line.trim(), (left.get(line.trim()) ?? 0) + 1);
  const added: string[] = [];
  for (const line of (after ?? "").split(/\r?\n/)) {
    const n = left.get(line.trim()) ?? 0;
    if (n > 0) left.set(line.trim(), n - 1);
    else added.push(line);
  }
  return added;
}

/** The hints a diff makes certain, one per artefact, in the harness's order (Rule 0664). */
export function requiredHints(changes: FileChange[]): Requirement[] {
  const found = new Map<Requirement["artefact"], string>();
  const need = (artefact: Requirement["artefact"], because: string) => {
    if (!found.has(artefact)) found.set(artefact, because);
  };
  for (const c of changes) {
    if (MANIFEST.test(c.path) && dependencies(c.before) !== dependencies(c.after)) need("sbom", `${c.path} changes its dependencies`);
    if (DOCKERFILE.test(c.path) && instructions(c.before) !== instructions(c.after)) need("image-manifest", `${c.path} changes an instruction`);
    if (SOURCE.test(c.path) && !TEST.test(c.path) && addedLines(c.before, c.after).some((line) => LOG_CALL.test(line))) need("logs", `${c.path} adds an error or warning log call`);
  }
  return (ARTEFACTS as readonly string[])
    .filter((a) => found.has(a as Requirement["artefact"]))
    .map((a) => ({ artefact: a as Requirement["artefact"], because: found.get(a as Requirement["artefact"])! }));
}

const hintOf = (text: string): string[] | undefined => {
  const m = HINT.exec(text.trim());
  if (!m) return undefined;
  const names = m[1]!.split(",").map((n) => n.trim());
  return names.every((n) => (ARTEFACTS as readonly string[]).includes(n)) ? names : undefined;
};

/** The body without its HTML comments (the template's guidance); an unclosed one runs to the end. Never rendered. */
function withoutComments(body: string): string {
  let out = "";
  let at = 0;
  for (;;) {
    const open = body.indexOf("<!--", at);
    if (open < 0) return out + body.slice(at);
    out += body.slice(at, open);
    const close = body.indexOf("-->", open + 4);
    if (close < 0) return out;
    at = close + 3;
  }
}

/** The body's CHANGELOG line, as the PR template asks for it; a line left unticked does not count. */
function changelogLine(body: string): string | undefined {
  for (const line of withoutComments(body).split(/\r?\n/)) {
    if (/^\s*[-*]\s*\[\s\]/.test(line)) continue;
    const m = /\bCHANGELOG(?: line| entry| hint)?\s*:\s*(.+)$/.exec(line);
    if (!m) continue;
    const rest = m[1]!.trim();
    const ticked = /^`([^`]+)`/.exec(rest);
    return (ticked ? ticked[1]! : rest).trim();
  }
  return undefined;
}

/** What the pull request declares, as the release harness reads it: the title's hint, else the CHANGELOG line's. */
export function declaredHints(title: string, body: string): string[] {
  const fromTitle = hintOf(title);
  if (fromTitle) return fromTitle;
  const line = changelogLine(body);
  return (line !== undefined ? hintOf(line) : undefined) ?? [];
}

/** The required artefacts the title's own hint leaves out: the release changelog draft reads the title, never the body. */
export function missingFromTitle(title: string, required: Requirement[]): Requirement[] {
  const inTitle = hintOf(title) ?? [];
  return required.filter((r) => !inTitle.includes(r.artefact));
}

/**
 * The title with every required artefact in its hint, or undefined when its own hint already names them all (Rule 0665).
 * The hint keeps what was declared, from the title or else the CHANGELOG line, and adds what the diff requires.
 */
export function fixedTitle(title: string, body: string, required: Requirement[]): string | undefined {
  if (missingFromTitle(title, required).length === 0) return undefined;
  const declared = declaredHints(title, body);
  const added = required.map((r) => r.artefact).filter((a) => !declared.includes(a));
  const plain = hintOf(title) ? title.trim().replace(HINT, "") : title.trim();
  return `${plain} (${[...declared, ...added].join(", ")})`;
}

/** What to do about a missing artefact: edit the title where the token can, else fail, a bot's pull request warned (Rule 0666). */
export function actionFor(missing: boolean, origin: Origin): Action {
  if (!missing) return "pass";
  if (origin.bot) return "warn";
  return origin.fork ? "fail" : "edit";
}

export function messageFor(action: Action, title: string, required: Requirement[]): string {
  const why = required.map((r) => `${r.artefact}: ${r.because}`).join("; ");
  if (action === "edit")
    return `Added the artefacts this diff moves to the title's CHANGELOG hint (${why}). The release harness reads the hint to count these differences as declared.`;
  if (action === "pass") return "The CHANGELOG hint names every artefact this diff is certain to move.";
  return `The CHANGELOG hint leaves out artefacts this diff moves (${why}). Retitle the pull request to: ${title}`;
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

const at = (ref: string, path: string): string | null => {
  try {
    return git("show", `${ref}:${path}`);
  } catch {
    return null;
  }
};

/**
 * The files a pull request changes, between the merge base of `base` and `head`, and `head`. A renamed or moved file
 * is read against its old path, so the log calls it already had are not counted as added.
 */
export function changesBetween(base: string, head: string): FileChange[] {
  const mergeBase = git("merge-base", base, head).trim();
  return git("diff", "--name-status", "-M", mergeBase, head)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .map((cols) => (cols[0]!.startsWith("R") ? { from: cols[1]!, path: cols[2]! } : { from: cols[1]!, path: cols[1]! }))
    .filter(({ path }) => MANIFEST.test(path) || DOCKERFILE.test(path) || SOURCE.test(path))
    .map(({ from, path }) => ({ path, before: at(mergeBase, from), after: at(head, path) }));
}

function main(argv: string[]): number {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const base = arg("--base") ?? "origin/main";
  const head = arg("--head") ?? "HEAD";
  const title = process.env.PR_TITLE ?? "";
  const body = process.env.PR_BODY ?? "";
  const required = requiredHints(changesBetween(base, head));
  const fixed = fixedTitle(title, body, required);
  const declared = declaredHints(title, body);
  const missing = missingFromTitle(title, required);
  process.stdout.write(`Required by the diff: ${required.length ? required.map((r) => `${r.artefact} (${r.because})`).join(", ") : "nothing"}` + "\n");
  process.stdout.write(`Declared: ${declared.length ? declared.join(", ") : "nothing"}` + "\n");
  process.stdout.write((fixed ? `Title to use: ${fixed}` : "The hint names every artefact this diff is certain to move.") + "\n");
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `missing=${missing.map((r) => r.artefact).join(",")}\ntitle=${(fixed ?? title).replace(/\r?\n/g, " ")}\nbecause=${missing.map((r) => `${r.artefact}: ${r.because}`).join("; ")}\n`
    );
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main(process.argv.slice(2)));
