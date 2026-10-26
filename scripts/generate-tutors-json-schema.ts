/**
 * Writes packages/jsr/types/tutors-json.schema.json from TUTORS_JSON_SCHEMA, for tools outside the
 * mono-repo (the release harness's `course check`) that read the contract as plain JSON Schema.
 *
 *   pnpm generate:tutors-json-schema
 *
 * tests/unit/types/tutors-json.test.ts fails when the file and the TypeScript constant differ.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TUTORS_JSON_SCHEMA } from "../packages/jsr/types/src/tutors-json.ts";
import { REPO_ROOT } from "./checks/lib/repo.ts";

export const SCHEMA_FILE = join(REPO_ROOT, "packages/jsr/types/tutors-json.schema.json");

export const schemaText = () => `${JSON.stringify(TUTORS_JSON_SCHEMA, null, 2)}\n`;

if (process.argv[1]?.endsWith("generate-tutors-json-schema.ts")) {
  writeFileSync(SCHEMA_FILE, schemaText());
  process.stdout.write(`wrote ${SCHEMA_FILE}\n`);
}
