/**
 * Shape check for release/openvex.json (Rules 0226 to 0228), the OpenVEX document a release keeps beside
 * release/claims.yaml to say which advisories cannot affect it.
 *
 *   pnpm check:openvex                 # release/openvex.json
 *   pnpm check:openvex path/to/file    # any other OpenVEX file
 *
 * The release harness (tutors-sdk/tutors-release-harness, src/image-static/vex.ts there, since harness 1.23.0)
 * fetches the file from beside the claims and hands it to grype with --vex on both sides, and refuses a file it
 * cannot use before any stack starts. This check mirrors its rules so the release push fails first:
 *
 *   - the document: `@context` is the OpenVEX context (https://openvex.dev/ns/v0.2.0), `@id`, `author` and
 *     `timestamp` are present, `version` is a whole number from 1, and `statements` is a list, which may be empty;
 *   - each statement names `vulnerability.name`, at least one product whose `@id` is a package URL (`pkg:`), and a
 *     `status` of not_affected, affected, fixed or under_investigation;
 *   - not_affected needs one of the five standard justifications (an impact_statement alone is not enough), and
 *     affected needs an action_statement.
 *
 * A product is a package URL because the harness scans each image's SBOM, not the image, and grype matches a
 * statement by the vulnerable package's purl (pkg:npm/tar@7.4.3).
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "./lib/repo.ts";

export const OPENVEX_CONTEXT = /^https:\/\/openvex\.dev\/ns\/v0\.\d+(\.\d+)?$/;
export const VEX_STATUSES = ["not_affected", "affected", "fixed", "under_investigation"] as const;
/** The five justifications the OpenVEX specification defines for not_affected, in its order. */
export const VEX_JUSTIFICATIONS = [
  "component_not_present",
  "vulnerable_code_not_present",
  "vulnerable_code_not_in_execute_path",
  "vulnerable_code_cannot_be_controlled_by_adversary",
  "inline_mitigations_already_exist"
] as const;

interface Statement {
  vulnerability?: { name?: unknown };
  products?: { "@id"?: unknown }[];
  status?: unknown;
  justification?: unknown;
  action_statement?: unknown;
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

function statementErrors(s: Statement, label: string): string[] {
  if (!s || typeof s !== "object") return [`${label}: is not an object`];
  const errors: string[] = [];
  if (!isText(s.vulnerability?.name)) errors.push(`${label}: vulnerability.name is required, the advisory id (CVE-2026-1234 or GHSA-xxxx-xxxx-xxxx)`);
  if (!Array.isArray(s.products) || s.products.length === 0) errors.push(`${label}: products must name at least one package URL`);
  else
    s.products.forEach((p, j) => {
      const id = p?.["@id"];
      if (!isText(id) || !id.startsWith("pkg:")) {
        errors.push(`${label}: products.${j}.@id must be a package URL (pkg:npm/tar@7.4.3), not ${JSON.stringify(id)}; the harness scans SBOMs and grype matches by the package's purl`);
      }
    });
  if (!VEX_STATUSES.includes(s.status as (typeof VEX_STATUSES)[number])) errors.push(`${label}: status must be one of ${VEX_STATUSES.join(", ")}, not ${JSON.stringify(s.status)}`);
  if (s.status === "not_affected" && !VEX_JUSTIFICATIONS.includes(s.justification as (typeof VEX_JUSTIFICATIONS)[number])) {
    errors.push(`${label}: not_affected needs a justification, one of ${VEX_JUSTIFICATIONS.join(", ")}; not ${JSON.stringify(s.justification)}`);
  }
  if (s.status === "affected" && !isText(s.action_statement)) errors.push(`${label}: affected needs an action_statement saying what is being done about it`);
  return errors;
}

/** Every problem with an OpenVEX document's text; an empty list means the release harness will scan with it. */
export function validateOpenVexText(text: string): string[] {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    return [`the file is not JSON: ${(error as Error).message}`];
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return ["the file is not a JSON object"];
  const d = doc as Record<string, unknown>;
  const errors: string[] = [];
  if (!isText(d["@context"]) || !OPENVEX_CONTEXT.test(d["@context"])) errors.push(`@context must be the OpenVEX context, https://openvex.dev/ns/v0.2.0, not ${JSON.stringify(d["@context"])}`);
  for (const field of ["@id", "author", "timestamp"]) if (!isText(d[field])) errors.push(`${field} is required`);
  if (!Number.isInteger(d.version) || (d.version as number) < 1) errors.push("version must be a whole number from 1");
  if (!Array.isArray(d.statements)) return [...errors, "statements must be a list (it may be empty)"];
  const statements = d.statements as Statement[];
  statements.forEach((s, i) => errors.push(...statementErrors(s, `statement ${i + 1} of ${statements.length}`)));
  return errors;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((a) => a.startsWith("--"))) {
    process.stderr.write("FAIL: usage: pnpm check:openvex [file]\n");
    process.exit(2);
  }
  const arg = args[0] ?? "release/openvex.json";
  const file = isAbsolute(arg) ? arg : join(REPO_ROOT, arg);
  if (!existsSync(file)) {
    process.stderr.write(`FAIL: ${arg} is missing. A release carries one beside release/claims.yaml; "statements": [] means no exceptions.\n`);
    process.exit(1);
  }
  const text = readFileSync(file, "utf8");
  const errors = validateOpenVexText(text);
  if (errors.length > 0) {
    process.stderr.write(`FAIL: ${arg} is not an OpenVEX file the release harness accepts:\n`);
    for (const error of errors) process.stderr.write(`  ${error}\n`);
    process.exit(1);
  }
  const count = (JSON.parse(text) as { statements: unknown[] }).statements.length;
  process.stdout.write(`OK: ${arg} is valid (${count} statement${count === 1 ? "" : "s"}).\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
