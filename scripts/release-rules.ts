/**
 * Publish the Rules a release defines, as the rules.json the release harness
 * resolves a claim's `rule` field against (harness contract 1.3.0).
 *
 *   pnpm release:rules                                   # the Rules at HEAD, on stdout
 *   pnpm release:rules --ref v16.3.0-rc.1                # at any git ref
 *   pnpm release:rules --ref v16.3.0-rc.1 --out rules.json
 *
 * The file is
 *
 *   { "version": 1, "rules": { "0031": { "title": "...", "digest": "..." } } }
 *
 * for every Rule under tests/bdd/features that carries exactly one `@rule-NNNN`
 * id. `title` is the Rule's title line. `digest` is the digest of the Rule block
 * (tags, title, scenarios and steps, ignoring whitespace and comments), the same
 * one `pnpm release:claims:draft` compares, so it moves when the Rule's meaning
 * moves and not when a file is reformatted or the Rule moves to another file.
 *
 * The output is a function of the Rules at the ref and nothing else: keys sorted
 * by id, no timestamps, no paths, one trailing newline. The same ref gives the
 * same bytes on any machine, so the file can be published beside a candidate tag
 * and compared later. It is read from git, not from the working tree.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gitIn, rulesAtRef, type GitRunner, type IndexedRule } from "./checks/lib/rules-index.ts";
import { buildChangelog } from "./release-changelog.ts";

export const RULES_JSON_VERSION = 1;

export interface RulesJson {
  version: typeof RULES_JSON_VERSION;
  rules: Record<string, { title: string; digest: string; prs?: number[] }>;
}

/** Code-unit order, not locale order: the same on every machine. */
const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The text of rules.json. Written by hand rather than with JSON.stringify of one
 * object, because an object lists integer-like keys ("1234") before the others
 * whatever order they were added in.
 */
export function renderRulesJson(rules: ReadonlyMap<string, Pick<IndexedRule, "title" | "digest">>, prs: ReadonlyMap<string, number[]> = new Map()): string {
  const ids = [...rules.keys()].sort(byId);
  const entries = ids.map((id) => {
    const { title, digest } = rules.get(id)!;
    const numbers = prs.get(id) ?? [];
    const prsField = numbers.length > 0 ? `, "prs": [${numbers.join(", ")}]` : "";
    return `    ${JSON.stringify(id)}: { "title": ${JSON.stringify(title)}, "digest": ${JSON.stringify(digest)}${prsField} }`;
  });
  const body = entries.length > 0 ? `{\n${entries.join(",\n")}\n  }` : "{}";
  return `{\n  "version": ${RULES_JSON_VERSION},\n  "rules": ${body}\n}\n`;
}

/** rules.json for the Rules a git ref defines; with `since`, the Rules changed after it name their pull requests. */
export function rulesJsonAtRef(ref: string, git: GitRunner = gitIn(), since?: string): string {
  const prs = new Map<string, number[]>();
  if (since !== undefined) for (const [id, rule] of Object.entries(buildChangelog(since, ref, git).rules)) prs.set(id, rule.prs);
  return renderRulesJson(rulesAtRef(ref, git), prs);
}

export function parseArgs(argv: string[]): { ref: string; out?: string; since?: string } {
  let ref = "HEAD";
  let out: string | undefined;
  let since: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === "--ref" || argv[i] === "--out" || argv[i] === "--since") {
      if (!value || value.startsWith("--")) throw new Error(`${argv[i]} needs a value`);
      if (argv[i] === "--ref") ref = value;
      else if (argv[i] === "--out") out = value;
      else since = value;
      i++;
    } else throw new Error(`unknown argument ${argv[i]}`);
  }
  return since === undefined ? { ref, out } : { ref, out, since };
}

function main(): void {
  try {
    const { ref, out, since } = parseArgs(process.argv.slice(2));
    const text = rulesJsonAtRef(ref, gitIn(), since);
    if (out === undefined) {
      process.stdout.write(text);
      return;
    }
    const file = resolve(out);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    process.stderr.write(`wrote ${out}: ${Object.keys((JSON.parse(text) as RulesJson).rules).length} Rule(s) at ${ref}\n`);
  } catch (error) {
    const message = (error as Error).message.split("\n")[0];
    process.stderr.write(`FAIL: ${message.startsWith("Command failed") ? `cannot read the Rules from that ref (${message})` : message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
