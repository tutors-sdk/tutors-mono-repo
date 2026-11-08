import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import type { ImportFile, ShapeKind } from "../../packages/jsr/course-rules/src/mod.ts";

export interface CorpusCase {
  name: string;
  description: string;
  files: ImportFile[];
  expected: { topics: { week: number; items: { kind: ShapeKind; files: string[] }[] }[]; tray: string[] };
}

const ROOT = resolve(__dirname, "../fixtures/import");

/** Every folder listing in tests/fixtures/import, with the shape proposeShape must give it. */
export function importCorpus(): CorpusCase[] {
  return readdirSync(ROOT)
    .filter((file) => file.endsWith(".yaml"))
    .sort()
    .map((file) => {
      const raw = yaml.load(readFileSync(resolve(ROOT, file), "utf-8"), { schema: yaml.JSON_SCHEMA }) as Omit<CorpusCase, "name" | "files"> & { files: (string | ImportFile)[] };
      return { ...raw, name: file.replace(/\.yaml$/, ""), files: raw.files.map((entry) => (typeof entry === "string" ? { path: entry } : entry)) };
    });
}

export function importCase(name: string): CorpusCase {
  const found = importCorpus().find((entry) => entry.name === name);
  if (!found) throw new Error(`No import corpus case "${name}"`);
  return found;
}
