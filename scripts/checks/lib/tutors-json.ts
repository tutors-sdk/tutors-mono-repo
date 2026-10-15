/**
 * Validates a tutors.json against TUTORS_JSON_SCHEMA (packages/jsr/types/src/tutors-json.ts).
 *
 * Shared by the generator differential (Rules 0263 and 0269), the generator's EARS steps and the unit tests,
 * so all three hold the generator to the same contract.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import { TUTORS_JSON_SCHEMA } from "../../../packages/jsr/types/src/tutors-json.ts";

// strictTypes off: the if/then branches name properties without repeating `type: "object"`.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
const validate = ajv.compile(TUTORS_JSON_SCHEMA);

/** Every way `value` breaks the tutors.json schema, one line each; empty when it conforms. */
export function tutorsJsonErrors(value: unknown): string[] {
  if (validate(value)) return [];
  return describe(value, validate.errors ?? []);
}

/** The id path of a JSON pointer, so `/los/0/los/2` reads `/los/[topic-01]/los/[lab-1]`. */
function readable(value: unknown, pointer: string): string {
  let node = value;
  let path = "";
  for (const part of pointer.split("/").slice(1)) {
    node = (node as Record<string, unknown> | undefined)?.[part];
    const id = /^\d+$/.test(part) && node && typeof node === "object" ? (node as { id?: unknown }).id : undefined;
    path += typeof id === "string" ? `/[${id}]` : `/${part}`;
  }
  return path || "/";
}

function describe(value: unknown, errors: ErrorObject[]): string[] {
  const lines = new Set<string>();
  for (const error of errors) {
    // `if` failures only say which branch applied; the branch's own errors carry the detail.
    if (error.keyword === "if") continue;
    const where = readable(value, error.instancePath);
    if (error.keyword === "unevaluatedProperties") {
      const property = (error.params as { unevaluatedProperty: string }).unevaluatedProperty;
      // A kind's fields only count as allowed when its branch passes, so a failing branch (a lab step
      // with a stray field, a talk missing pdfFile) would also flag the fields it does allow. Report
      // the cause; a field that is unexpected as well shows up once the cause is fixed.
      const below = `${error.instancePath}/`;
      const caused = (other: ErrorObject) =>
        other.keyword !== "if" && (other.instancePath.startsWith(below) || (other.instancePath === error.instancePath && other.keyword !== "unevaluatedProperties"));
      if (errors.some(caused)) continue;
      lines.add(`${where} has a field the schema does not allow: ${property}`);
      continue;
    }
    if (error.keyword === "additionalProperties") {
      lines.add(`${where} has a field the schema does not allow: ${(error.params as { additionalProperty: string }).additionalProperty}`);
      continue;
    }
    lines.add(`${where} ${error.message}`);
  }
  return [...lines];
}
