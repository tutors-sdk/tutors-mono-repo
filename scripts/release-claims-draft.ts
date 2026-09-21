/**
 * Draft claims for a release: the Rules that differ between the production tag
 * and the release candidate, as release/claims.yaml stubs.
 *
 *   pnpm release:claims:draft --from v16.2.2 --to release/16.3.0
 *
 * Each added or changed Rule becomes one claim with its `reason` filled in as
 * "Rule <id>: <title>". The `artefact` and `scope` are left as TODO: only the
 * author knows which page or route the Rule changes. The draft is not a valid
 * claims file until every TODO is replaced (`pnpm check:release-claims`), and
 * that is on purpose. A removed Rule is listed as a comment: it cannot be cited
 * by id, so its claim, if it needs one, cites a CHANGELOG entry.
 */
import { pathToFileURL } from "node:url";
import { diffRules, gitIn, rulesAtRef, type GitRunner, type IndexedRule, type RuleDiff } from "./checks/lib/rules-index.ts";

/** A double-quoted YAML scalar. JSON string syntax is valid YAML. */
const quote = (text: string) => JSON.stringify(text);

function stub(rule: IndexedRule, note: string): string[] {
  return [
    `  # ${note}: ${rule.file}:${rule.line}`,
    "  - artefact: TODO # dom | screenshot | network | console | headers | axe | metrics | logs | timing | \"*\"",
    "    scope: TODO # the page key, route or glob this Rule changes, e.g. \"reader:lab-step*\"",
    `    reason: ${quote(`Rule ${rule.id}: ${rule.title}`)}`
  ];
}

export function renderDraft(diff: RuleDiff, from: string, to: string): string {
  const out = [
    `# Draft claims for ${from}..${to}: ${diff.added.length} Rule(s) added, ${diff.changed.length} changed, ${diff.removed.length} removed.`,
    "# Replace every TODO, and delete a stub whose Rule changes nothing observable.",
    "# A Rule can be observable in several artefacts: copy the stub once per artefact and scope."
  ];
  const stubs = [...diff.added.map((rule) => stub(rule, "added")), ...diff.changed.map((rule) => stub(rule, "changed"))];
  out.push(stubs.length > 0 ? "claims:" : "claims: []");
  for (const lines of stubs) out.push(...lines);
  if (diff.removed.length > 0) {
    out.push("", "# Removed Rules cannot be cited by id. If one changes what the release shows, add a claim whose reason cites the CHANGELOG entry,", "# and add the id to tests/bdd/ears-retired-rule-ids.txt if it is not there already:");
    for (const rule of diff.removed) out.push(`#   Rule ${rule.id}: ${rule.title}`);
  }
  return out.join("\n") + "\n";
}

export function draftClaims(from: string, to: string, git: GitRunner = gitIn()): string {
  return renderDraft(diffRules(rulesAtRef(from, git), rulesAtRef(to, git)), from, to);
}

export function parseArgs(argv: string[]): { from: string; to: string } {
  let from: string | undefined;
  let to: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") from = argv[++i];
    else if (argv[i] === "--to") to = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!from || !to) throw new Error("usage: pnpm release:claims:draft --from <production tag> --to <release candidate ref>");
  return { from, to };
}

function main(): void {
  try {
    const { from, to } = parseArgs(process.argv.slice(2));
    process.stdout.write(draftClaims(from, to));
  } catch (error) {
    process.stderr.write(`FAIL: ${(error as Error).message.split("\n")[0]}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
