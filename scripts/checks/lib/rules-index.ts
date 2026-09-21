/**
 * The Rules in a set of feature files, keyed by id, in the working tree or at
 * any git ref. The release tooling uses it to say which Rules a release adds,
 * changes or removes, and to check that a claim cites a Rule that exists.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseGherkin, ruleBlock, ruleId } from "./gherkin-rules.ts";
import { REPO_ROOT, readText, toPosix, walk } from "./repo.ts";

export const FEATURES_PATH = "tests/bdd/features";

export interface IndexedRule {
  id: string;
  title: string;
  file: string;
  line: number;
  /** A digest of the whole Rule block: title, tags, scenarios and steps. */
  digest: string;
}

/** Rules that carry exactly one well-formed id. A Rule without one is an audit finding, not something a release can cite. */
export function indexRules(files: { path: string; text: string }[]): Map<string, IndexedRule> {
  const index = new Map<string, IndexedRule>();
  for (const { path, text } of files) {
    for (const rule of parseGherkin(text).rules) {
      const id = ruleId(rule);
      if (!id) continue;
      const digest = createHash("sha1").update(ruleBlock(text, rule).join("\n")).digest("hex");
      index.set(id, { id, title: rule.title, file: path, line: rule.line, digest });
    }
  }
  return index;
}

export function rulesInWorkingTree(root: string = REPO_ROOT): Map<string, IndexedRule> {
  const files = walk(join(root, FEATURES_PATH), (name) => name.endsWith(".feature"))
    .sort()
    .map((path) => ({ path: toPosix(path, root), text: readText(path) }));
  return indexRules(files);
}

export type GitRunner = (args: string[]) => string;

export function gitIn(cwd: string = REPO_ROOT): GitRunner {
  return (args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function rulesAtRef(ref: string, git: GitRunner = gitIn()): Map<string, IndexedRule> {
  const paths = git(["ls-tree", "-r", "--name-only", ref, "--", FEATURES_PATH])
    .split(/\r?\n/)
    .filter((path) => path.endsWith(".feature"));
  return indexRules(paths.map((path) => ({ path, text: git(["show", `${ref}:${path}`]) })));
}

export interface RuleDiff {
  added: IndexedRule[];
  /** The Rule at the newer ref, for a Rule whose block differs. */
  changed: IndexedRule[];
  /** The Rule as it was at the older ref. */
  removed: IndexedRule[];
}

/** Compares by id, so a Rule that moves to another file is not an add and a remove. Each list is sorted by id. */
export function diffRules(from: Map<string, IndexedRule>, to: Map<string, IndexedRule>): RuleDiff {
  const byId = (a: IndexedRule, b: IndexedRule) => a.id.localeCompare(b.id);
  return {
    added: [...to.values()].filter((rule) => !from.has(rule.id)).sort(byId),
    changed: [...to.values()].filter((rule) => from.has(rule.id) && from.get(rule.id)!.digest !== rule.digest).sort(byId),
    removed: [...from.values()].filter((rule) => !to.has(rule.id)).sort(byId)
  };
}
