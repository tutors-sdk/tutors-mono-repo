/**
 * Shape check for release/claims.yaml, the file a release uses to tell the
 * release harness (tutors-sdk/tutors-release-harness) what it meant to change.
 *
 *   pnpm check:release-claims                 # release/claims.yaml
 *   pnpm check:release-claims path/to/file    # any other claims file
 *
 * The harness owns the real schema (src/claims/schema.ts there) and rejects a
 * bad file when the candidate is judged. This check mirrors that schema so the
 * release PR fails first, minutes after the push, instead of the harness run.
 * Keep the two in step: the artefact list and the reason rules are copied.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { REPO_ROOT } from "./lib/repo.ts";

export const ARTEFACTS = ["dom", "screenshot", "network", "console", "headers", "axe", "metrics", "logs", "timing"] as const;

const FIELDS: ReadonlySet<string> = new Set(["artefact", "scope", "reason", "approvedBy"]);
const RUBBER_STAMP = /^(see pr|approved|all|ok|misc)\b/i;

/** A claim that could match anything; the harness requires a named human on these. */
export function isBroad(claim: { artefact?: unknown; scope?: unknown }): boolean {
  const scope = typeof claim.scope === "string" ? claim.scope.trim() : "";
  return claim.artefact === "*" || scope === "*" || scope === "**" || /^\*+\/?\*+$/.test(scope);
}

/** Every problem with a claims file's text; an empty list means the harness will accept it. */
export function validateClaimsText(text: string): string[] {
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
    if (typeof claim.reason !== "string" || claim.reason.length < 8) {
      errors.push(`${label}: reason is required and names a Rule id or a changelog entry`);
    } else if (RUBBER_STAMP.test(claim.reason.trim())) {
      errors.push(`${label}: a reason names a Rule or a changelog entry, not a rubber stamp`);
    }
    if (claim.approvedBy !== undefined && (typeof claim.approvedBy !== "string" || claim.approvedBy === "")) {
      errors.push(`${label}: approvedBy must be a person's name or handle`);
    }
    if (isBroad(claim) && !claim.approvedBy) errors.push(`${label}: a broad claim needs approvedBy (a person, never a bot)`);
  });
  return errors;
}

function main(): void {
  const arg = process.argv[2] ?? "release/claims.yaml";
  const file = isAbsolute(arg) ? arg : join(REPO_ROOT, arg);
  if (!existsSync(file)) {
    console.error(`FAIL: ${arg} is missing. A release branch carries one; \`claims: []\` means nothing observable should differ.`);
    process.exit(1);
  }
  const errors = validateClaimsText(readFileSync(file, "utf8"));
  if (errors.length > 0) {
    console.error(`FAIL: ${arg} is not a valid claims file:`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  const count = ((yaml.load(readFileSync(file, "utf8")) as { claims: unknown[] }).claims ?? []).length;
  console.log(`OK: ${arg} is valid (${count} claim${count === 1 ? "" : "s"}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
