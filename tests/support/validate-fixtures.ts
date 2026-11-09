import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

export const VALIDATE_RULES = ["V001", "V002", "V003", "V004", "V005", "V006", "V007", "V008", "V009", "V010", "V011", "V012"] as const;
export type FixtureForm = "broken" | "fixed";

const ROOT = resolve(__dirname, "../fixtures/validate");

/** A validator fixture course as a path-to-contents map. */
export function validateFixture(rule: string, form: FixtureForm): Record<string, string> {
  const fixture = yaml.load(readFileSync(resolve(ROOT, `${rule}.yaml`), "utf-8")) as Record<FixtureForm, Record<string, string>>;
  return fixture[form];
}
