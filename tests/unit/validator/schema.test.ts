import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { validatorSchemaPath, validatorSchemaText } from "../../../scripts/generate-validator-schema.ts";

it("ships the shared Tutors schema precompiled, so CSP does not need unsafe-eval", () => {
  const generated = readFileSync(validatorSchemaPath, "utf8");
  expect(generated).toBe(validatorSchemaText());
  expect(generated).not.toMatch(/new Function|\beval\(/);
});
