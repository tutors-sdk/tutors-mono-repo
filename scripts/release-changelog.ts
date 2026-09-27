/**
 * The changelog of a release, generated from git: every pull request merged between two
 * refs, grouped the way CHANGELOG.md groups them, with the EARS Rules each one added,
 * changed or removed.
 *
 *   pnpm release:changelog --from v16.2.2 --to release/16.3.0
 *   pnpm release:changelog --from v16.2.2 --to release/16.3.0 --json changelog.json --out changelog.md
 *
 * A pull request is a first-parent commit on the `to` side: a GitHub merge commit
 * ("Merge pull request #N from ...", its title on the body's first line) or a squash
 * commit ("title (#N)"). Merges of a release/* branch are the previous release coming
 * back to main and are left out. A first-parent commit with neither is listed as not
 * from a pull request, because nobody reviewed it.
 *
 * The section comes from the paths a pull request changed (apps/reader is the Reader,
 * packages/jsr the Shared Packages, deploy and .github Infrastructure, tests, scripts and
 * guides Development), and the heading from its Conventional Commits type: feat is a
 * Feature, fix and perf a Fix, `!` or "BREAKING CHANGE" a Breaking Change, anything else
 * a Chore. A trailing parenthesis of harness artefacts in the title, `(axe, dom)`, is
 * kept as the entry's hints (CONTRIBUTING.md#changelog-entries).
 *
 * The Rules of a pull request are the Rules that differ, by id and digest, between its
 * first parent and itself (the same comparison as `pnpm release:claims:draft`). The
 * Rules of the release are the Rules that differ between `from` and `to`, each with the
 * pull requests that touched it. `pnpm release:rules --since <from>` writes those
 * pull requests into rules.json, where the release harness scorecard reads them.
 *
 * The output is a draft for the release author, not CHANGELOG.md itself: CHANGELOG.md
 * stays curated by hand (guides/Release-Strategy.md#changelog-discipline). It is a
 * function of the two refs and nothing else, so the same refs give the same bytes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ARTEFACTS } from "./checks/release-claims.ts";
import { FEATURES_PATH, diffRules, gitIn, rulesAtRef, type GitRunner, type IndexedRule } from "./checks/lib/rules-index.ts";

export const CHANGELOG_JSON_VERSION = 1;

export const SECTIONS = ["Reader", "Live", "Catalogue", "Time", "Shared Packages", "Infrastructure", "Development"] as const;
export type Section = (typeof SECTIONS)[number];

export const KINDS = ["Breaking Changes", "Features", "Fixes", "Chores"] as const;
export type Kind = (typeof KINDS)[number];

/** First match wins, so a more specific prefix comes first. Paths no prefix matches are Development. */
const SECTION_BY_PATH: readonly [RegExp, Section][] = [
  [/^apps\/reader\//, "Reader"],
  [/^apps\/live\//, "Live"],
  [/^apps\/catalogue\//, "Catalogue"],
  [/^apps\/time\//, "Time"],
  // The Svelte packages ship inside the apps, and almost all of them inside the reader.
  [/^packages\/svelte\//, "Reader"],
  [/^packages\/jsr\//, "Shared Packages"],
  [/^(deploy|observability|supabase|etc)\/|^Dockerfile$|^compose\.yaml$|^\.github\/workflows\/(image-build|deploy|release-dispatch|release-harness-report)\.yml$/, "Infrastructure"]
];

export function sectionOf(path: string): Section {
  return SECTION_BY_PATH.find(([pattern]) => pattern.test(path))?.[1] ?? "Development";
}

export interface RuleRef {
  id: string;
  title: string;
}

export interface Entry {
  /** null for a commit that did not come from a pull request. */
  pr: number | null;
  sha: string;
  /** The title with its Conventional Commits prefix and artefact hints removed. */
  title: string;
  kind: Kind;
  /** Every section the pull request touched; the first is where the entry is listed. */
  sections: Section[];
  hints: string[];
  rules: { added: RuleRef[]; changed: RuleRef[]; removed: RuleRef[] };
  /** Whether CHANGELOG.md at `to` already names this pull request. */
  curated: boolean;
}

export interface ReleaseChangelog {
  version: typeof CHANGELOG_JSON_VERSION;
  from: string;
  to: string;
  entries: Entry[];
  /** The Rules that differ between `from` and `to`, by id, with the pull requests that touched them. */
  rules: Record<string, { title: string; change: "added" | "changed" | "removed"; prs: number[] }>;
}

const MERGE = /^Merge pull request #(\d+) from (\S+)/;
const SQUASH = /\(#(\d+)\)\s*$/;
const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*/;
const HINTS = /\s*\(([a-z-]+(?:\s*,\s*[a-z-]+)*)\)\s*$/;

export interface Commit {
  sha: string;
  subject: string;
  body: string;
}

/** The pull request number, its title and whether it is a release branch coming back, from a first-parent commit. */
export function pullRequestOf(commit: Commit): { pr: number | null; title: string; release: boolean } {
  const merge = MERGE.exec(commit.subject);
  if (merge) {
    const title = commit.body.split(/\r?\n/).find((line) => line.trim() !== "")?.trim() ?? titleFromBranch(merge[2]!);
    return { pr: Number(merge[1]), title, release: /(^|\/)release\//.test(merge[2]!) };
  }
  const squash = SQUASH.exec(commit.subject);
  if (squash) return { pr: Number(squash[1]), title: commit.subject.replace(SQUASH, "").trim(), release: false };
  return { pr: null, title: commit.subject.trim(), release: false };
}

const BRANCH_TYPES: Record<string, string> = { feat: "feat", feature: "feat", fix: "fix", bugfix: "fix", hotfix: "fix", perf: "perf" };

/**
 * A title for a merge whose pull request had no description, from its branch:
 * "tutors-sdk/fix/enable-rls-public-tables" is "fix: enable rls public tables", which
 * parseTitle then reads like any other. A branch with no type prefix is a chore.
 */
export function titleFromBranch(branch: string): string {
  const parts = branch.split("/").slice(1);
  const type = parts.length > 1 ? BRANCH_TYPES[parts[0]!.toLowerCase()] : undefined;
  const words = parts[parts.length - 1]!.replace(/[-_]+/g, " ").trim();
  return type ? `${type}: ${words}` : words;
}

/** The heading, the hints and the plain title of a pull request title. */
export function parseTitle(raw: string, body = ""): { kind: Kind; hints: string[]; title: string } {
  let title = raw.trim();
  let kind: Kind = "Chores";
  const conventional = CONVENTIONAL.exec(title);
  if (conventional) {
    const type = conventional[1]!.toLowerCase();
    kind = conventional[3] ? "Breaking Changes" : type === "feat" ? "Features" : type === "fix" || type === "perf" ? "Fixes" : "Chores";
    title = title.slice(conventional[0].length);
  }
  if (/^BREAKING[ -]CHANGE:/m.test(body)) kind = "Breaking Changes";
  let hints: string[] = [];
  const hint = HINTS.exec(title);
  if (hint) {
    const names = hint[1]!.split(",").map((name) => name.trim());
    if (names.every((name) => (ARTEFACTS as readonly string[]).includes(name))) {
      hints = names;
      title = title.slice(0, hint.index).trim();
    }
  }
  return { kind, hints, title: title.charAt(0).toUpperCase() + title.slice(1) };
}

/**
 * The sections a set of changed paths touches. The first is where the entry is listed: the
 * section with the most changed files, Development last because almost every pull request
 * adds a test; ties go to SECTIONS order. The rest follow in SECTIONS order.
 */
export function sectionsOf(paths: string[]): Section[] {
  const files = new Map<Section, number>();
  for (const path of paths) files.set(sectionOf(path), (files.get(sectionOf(path)) ?? 0) + 1);
  const touched = SECTIONS.filter((section) => files.has(section));
  if (touched.length === 0) return ["Development"];
  const product = touched.filter((section) => section !== "Development");
  const primary = (product.length > 0 ? product : touched).reduce((best, section) => (files.get(section)! > files.get(best)! ? section : best));
  return [primary, ...touched.filter((section) => section !== primary)];
}

const ref = (rule: IndexedRule): RuleRef => ({ id: rule.id, title: rule.title });

/** Whether CHANGELOG.md names a pull request, as "PR #N" or "(#N)". */
export function curatedPrs(changelog: string): Set<number> {
  return new Set([...changelog.matchAll(/(?:PR #|\(#)(\d+)\b/g)].map((match) => Number(match[1])));
}

export function buildChangelog(from: string, to: string, git: GitRunner = gitIn()): ReleaseChangelog {
  const shas = git(["rev-list", "--first-parent", "--reverse", `${from}..${to}`]).split(/\r?\n/).filter(Boolean);
  let changelog = "";
  try {
    changelog = git(["show", `${to}:CHANGELOG.md`]);
  } catch {
    // A ref without a CHANGELOG.md curates nothing.
  }
  const curated = curatedPrs(changelog);
  const entries: Entry[] = [];
  const rulePrs = new Map<string, Set<number>>();
  // Each commit's first parent is the previous commit on the chain, so its Rules are the previous commit's.
  let before: Map<string, IndexedRule> | undefined;
  for (const sha of shas) {
    const subject = git(["log", "-1", "--format=%s", sha]).trim();
    const body = git(["log", "-1", "--format=%b", sha]);
    const parent = `${sha}^1`;
    const paths = git(["diff", "--name-only", parent, sha]).split(/\r?\n/).filter(Boolean);
    const touchesRules = paths.some((path) => path.startsWith(`${FEATURES_PATH}/`));
    before ??= rulesAtRef(parent, git);
    const after = touchesRules ? rulesAtRef(sha, git) : before;
    const diff = diffRules(before, after);
    before = after;

    const { pr, title: rawTitle, release } = pullRequestOf({ sha, subject, body });
    if (release) continue;
    const { kind, hints, title } = parseTitle(rawTitle, body);
    if (pr !== null) for (const rule of [...diff.added, ...diff.changed, ...diff.removed]) rulePrs.set(rule.id, (rulePrs.get(rule.id) ?? new Set()).add(pr));
    entries.push({
      pr,
      sha: sha.slice(0, 7),
      title,
      kind,
      sections: sectionsOf(paths),
      hints,
      rules: { added: diff.added.map(ref), changed: diff.changed.map(ref), removed: diff.removed.map(ref) },
      curated: pr !== null && curated.has(pr)
    });
  }

  const release = diffRules(rulesAtRef(from, git), rulesAtRef(to, git));
  const rules: ReleaseChangelog["rules"] = {};
  const list = (rule: IndexedRule, change: "added" | "changed" | "removed") => {
    rules[rule.id] = { title: rule.title, change, prs: [...(rulePrs.get(rule.id) ?? [])].sort((a, b) => a - b) };
  };
  release.added.forEach((rule) => list(rule, "added"));
  release.changed.forEach((rule) => list(rule, "changed"));
  release.removed.forEach((rule) => list(rule, "removed"));
  return { version: CHANGELOG_JSON_VERSION, from, to, entries, rules: sortedById(rules) };
}

/** Code-unit order, as release:rules sorts: an object lists integer-like keys first whatever order they were added in, so sort once here for the Markdown. */
function sortedById<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(record).sort().map((id) => [id, record[id]!]));
}

const ruleIds = (entry: Entry): string[] => [...entry.rules.added, ...entry.rules.changed].map((rule) => rule.id).sort();

/** "0019, 0020, 0021, 0031" as "0019-0021, 0031": a pull request can add forty Rules. */
export function ruleRanges(ids: string[]): string {
  const runs: string[][] = [];
  for (const id of ids) {
    const run = runs[runs.length - 1];
    if (run && Number(id) === Number(run[run.length - 1]) + 1) run.push(id);
    else runs.push([id]);
  }
  return runs.map((run) => (run.length > 2 ? `${run[0]}-${run[run.length - 1]}` : run.join(", "))).join(", ");
}

export function renderEntry(entry: Entry): string {
  const hints = entry.hints.length > 0 ? ` (${entry.hints.join(", ")})` : "";
  const origin = entry.pr !== null ? ` (PR #${entry.pr})` : ` (${entry.sha}, not from a pull request)`;
  const ids = ruleIds(entry);
  const rules = ids.length > 0 ? ` · Rule${ids.length > 1 ? "s" : ""} ${ruleRanges(ids)}` : "";
  const also = entry.sections.length > 1 ? ` · also ${entry.sections.slice(1).join(", ")}` : "";
  return `- ${entry.title}${hints}${origin}${rules}${also}`;
}

/** Text for a Markdown table cell: a backslash or a pipe is escaped, so a title cannot end the cell or eat the next escape. */
export const tableCell = (text: string): string => text.replace(/[\\|]/g, "\\$&");

export function renderMarkdown(log: ReleaseChangelog): string {
  const prs = log.entries.filter((entry) => entry.pr !== null).length;
  const direct = log.entries.length - prs;
  const counts = { added: 0, changed: 0, removed: 0 };
  for (const rule of Object.values(log.rules)) counts[rule.change]++;
  const out = [
    `# Changes from ${log.from} to ${log.to}`,
    "",
    `> Generated by \`pnpm release:changelog\` from ${prs} pull request(s)${direct > 0 ? ` and ${direct} commit(s) not from a pull request` : ""}.`,
    `> EARS Rules: ${counts.added} added, ${counts.changed} changed, ${counts.removed} removed.`,
    "> A draft to curate into CHANGELOG.md, not a replacement for it. Entries marked ✓ are already in CHANGELOG.md."
  ];
  for (const section of SECTIONS) {
    const inSection = log.entries.filter((entry) => entry.sections[0] === section);
    if (inSection.length === 0) continue;
    out.push("", `## ${section}`);
    for (const kind of KINDS) {
      const inKind = inSection.filter((entry) => entry.kind === kind);
      if (inKind.length === 0) continue;
      out.push("", `#### ${kind}`, "");
      for (const entry of inKind) out.push(renderEntry(entry) + (entry.curated ? " ✓" : ""));
    }
  }
  const ids = Object.keys(log.rules);
  if (ids.length > 0) {
    out.push("", "## EARS Rules in this release", "", "| Rule | Change | Pull requests | Title |", "| --- | --- | --- | --- |");
    for (const id of ids) {
      const rule = log.rules[id]!;
      const prsOf = rule.prs.length > 0 ? rule.prs.map((pr) => `#${pr}`).join(", ") : "—";
      out.push(`| ${id} | ${rule.change} | ${prsOf} | ${tableCell(rule.title)} |`);
    }
  }
  return out.join("\n") + "\n";
}

export function parseArgs(argv: string[]): { from: string; to: string; out?: string; json?: string } {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (!["--from", "--to", "--out", "--json"].includes(flag)) throw new Error(`unknown argument ${flag}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    values[flag.slice(2)] = value;
    i++;
  }
  if (!values.from || !values.to) throw new Error("usage: pnpm release:changelog --from <production tag> --to <release ref> [--out changelog.md] [--json changelog.json]");
  return { from: values.from, to: values.to, ...(values.out ? { out: values.out } : {}), ...(values.json ? { json: values.json } : {}) };
}

function write(path: string, text: string): void {
  const file = resolve(path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function main(): void {
  try {
    const { from, to, out, json } = parseArgs(process.argv.slice(2));
    const log = buildChangelog(from, to);
    const markdown = renderMarkdown(log);
    if (json) write(json, JSON.stringify(log, null, 2) + "\n");
    if (out) write(out, markdown);
    else process.stdout.write(markdown);
  } catch (error) {
    const message = (error as Error).message.split("\n")[0]!;
    process.stderr.write(`FAIL: ${message.startsWith("Command failed") ? `cannot read git history between those refs (${message})` : message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
