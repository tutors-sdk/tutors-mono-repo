/**
 * Shape check for release/claims.yaml, the file a release uses to tell the
 * release harness (tutors-sdk/tutors-release-harness) what it meant to change.
 *
 *   pnpm check:release-claims                 # release/claims.yaml
 *   pnpm check:release-claims path/to/file    # any other claims file
 *   pnpm check:release-claims --ref <ref>     # resolve Rules against the ones defined at a git ref, not the working tree
 *
 * The harness owns the real schema (src/claims/schema.ts there) and rejects a
 * bad file when the candidate is judged. This check mirrors that schema so the
 * release PR fails first, minutes after the push, instead of the harness run.
 * Keep the two in step: the artefact list and the reason rules are copied.
 *
 * One rule is this repository's own: a claim that cites a Rule must cite one that
 * a feature under tests/bdd/features defines at the ref being checked. It cites a
 * Rule in either of two ways: the `rule: "0031"` field (harness contract 1.3.0,
 * where `reason` becomes optional), or a `reason` that starts "Rule 0031". Any
 * other reason, such as a CHANGELOG entry, stays free text.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { REPO_ROOT } from "./lib/repo.ts";
import { rulesAtRef, rulesInWorkingTree } from "./lib/rules-index.ts";

export const ARTEFACTS = ["dom", "screenshot", "network", "console", "headers", "axe", "metrics", "logs", "timing"] as const;

const FIELDS: ReadonlySet<string> = new Set(["artefact", "scope", "reason", "rule", "approvedBy"]);
const RUBBER_STAMP = /^(see pr|approved|all|ok|misc)\b/i;

/** A claim that could match anything; the harness requires a named human on these. */
export function isBroad(claim: { artefact?: unknown; scope?: unknown }): boolean {
  const scope = typeof claim.scope === "string" ? claim.scope.trim() : "";
  return claim.artefact === "*" || scope === "*" || scope === "**" || /^\*+\/?\*+$/.test(scope);
}

/** A reason that starts "Rule 0031" cites a Rule by id. Anything else is free text, such as a CHANGELOG entry. */
const RULE_CITATION = /^Rule\s+(\d+)\b/i;

/**
 * Checks the `rule` field of one claim, adding to `errors`. Returns true when the claim
 * has a well-formed `rule` (and, when `ruleIds` are given, one that is defined).
 */
function validateRuleField(rule: unknown, label: string, ruleIds: ReadonlySet<string> | undefined, errors: string[]): boolean {
  if (rule === undefined) return false;
  if (typeof rule !== "string" || !/^\d{4}$/.test(rule)) {
    errors.push(`${label}: rule must be a four-digit Rule id in quotes, as in rule: "0031"`);
    return false;
  }
  if (ruleIds && !ruleIds.has(rule)) {
    errors.push(`${label}: rule ${rule} is not defined by any feature under tests/bdd/features; cite a Rule that exists in this release`);
    return false;
  }
  return true;
}

/**
 * Every problem with a claims file's text; an empty list means the harness will accept it.
 *
 * `ruleIds` are the Rule ids the release ref defines (the `@rule-NNNN` tags under
 * tests/bdd/features). When given, a `rule` field, and a reason that cites a Rule,
 * must name one of them.
 * Without it the citation is not resolved, which is how the harness reads the file.
 */
export function validateClaimsText(text: string, ruleIds?: ReadonlySet<string>): string[] {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (error) {
    return [`not valid YAML: ${(error as Error).message.split("\n")[0]}`];
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return ["the file must be a mapping with a `claims` list (use `claims: []` for none)"];

  const errors: string[] = [];
  const root = doc as Record<string, unknown>;
  for (const key of Object.keys(root)) if (key !== "claims") errors.push(`unknown top-level key \`${key}\``);
  if (!Array.isArray(root.claims)) return [...errors, "`claims` must be a list (use `claims: []` for none)"];

  root.claims.forEach((raw: unknown, index: number) => {
    const label = `claims[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return errors.push(`${label}: not a mapping`);
    const claim = raw as Record<string, unknown>;
    for (const key of Object.keys(claim)) if (!FIELDS.has(key)) errors.push(`${label}: unknown field \`${key}\``);

    if (claim.artefact !== "*" && !(ARTEFACTS as readonly unknown[]).includes(claim.artefact)) {
      errors.push(`${label}: artefact must be one of ${ARTEFACTS.join(", ")} or "*"`);
    }
    if (typeof claim.scope !== "string" || claim.scope === "") errors.push(`${label}: scope is required`);
    const citedByField = validateRuleField(claim.rule, label, ruleIds, errors);
    if (claim.reason === undefined && claim.rule !== undefined) {
      // `rule` stands in for the reason; a malformed or unknown `rule` was reported above.
    } else if (typeof claim.reason !== "string" || claim.reason.length < 8) {
      errors.push(`${label}: reason is required and names a Rule id or a changelog entry, unless the claim has a \`rule\``);
    } else if (RUBBER_STAMP.test(claim.reason.trim())) {
      errors.push(`${label}: a reason names a Rule or a changelog entry, not a rubber stamp`);
    } else {
      const cited = claim.reason.trim().match(RULE_CITATION)?.[1];
      if (cited !== undefined && citedByField && typeof claim.rule === "string" && cited !== claim.rule) {
        errors.push(`${label}: rule is ${claim.rule} but reason cites Rule ${cited}; a claim is about one Rule`);
      } else if (ruleIds && cited !== undefined && !/^\d{4}$/.test(cited)) {
        errors.push(`${label}: Rule ids have four digits, as in "Rule 0031"; "${cited}" is not one`);
      } else if (ruleIds && cited !== undefined && !ruleIds.has(cited)) {
        errors.push(`${label}: reason cites Rule ${cited}, which no feature under tests/bdd/features defines; cite a Rule that exists in this release, or a CHANGELOG entry`);
      }
    }
    if (claim.approvedBy !== undefined && (typeof claim.approvedBy !== "string" || claim.approvedBy === "")) {
      errors.push(`${label}: approvedBy must be a person's name or handle`);
    }
    if (isBroad(claim) && !claim.approvedBy) errors.push(`${label}: a broad claim needs approvedBy (a person, never a bot)`);
  });
  return errors;
}

/** `[file] [--ref <ref>]`; the file defaults to release/claims.yaml. */
export function parseArgs(argv: string[]): { arg: string; ref?: string } {
  let arg: string | undefined;
  let ref: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ref") {
      ref = argv[++i];
      if (!ref || ref.startsWith("--")) throw new Error("--ref needs a git ref");
    } else if (argv[i].startsWith("--")) throw new Error(`unknown argument ${argv[i]}`);
    else if (arg === undefined) arg = argv[i];
    else throw new Error("only one claims file can be checked at a time");
  }
  return { arg: arg ?? "release/claims.yaml", ref };
}

function main(): void {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`FAIL: ${(error as Error).message}. usage: pnpm check:release-claims [file] [--ref <git ref>]
`);
    process.exit(2);
  }
  const { arg, ref } = parsed;
  const file = isAbsolute(arg) ? arg : join(REPO_ROOT, arg);
  if (!existsSync(file)) {
    process.stderr.write(`FAIL: ${arg} is missing. A release branch carries one; \`claims: []\` means nothing observable should differ.\n`);
    process.exit(1);
  }
  const errors = validateClaimsText(readFileSync(file, "utf8"), new Set((ref ? rulesAtRef(ref) : rulesInWorkingTree()).keys()));
  if (errors.length > 0) {
    process.stderr.write(`FAIL: ${arg} is not a valid claims file:\n`);
    for (const error of errors) process.stderr.write(`  ${error}\n`);
    process.exit(1);
  }
  const count = ((yaml.load(readFileSync(file, "utf8")) as { claims: unknown[] }).claims ?? []).length;
  process.stdout.write(`OK: ${arg} is valid (${count} claim${count === 1 ? "" : "s"}).\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
