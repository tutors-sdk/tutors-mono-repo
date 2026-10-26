import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import { moduleScores, moduleStatuses, type MutationReport } from "../../scripts/checks/mutation-floors.ts";
import { jobResults, nightResult, packageOf, qualityRecord, type QualityInput, type QualityRecord } from "../../scripts/checks/release-quality.ts";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const mutants = (killed: number, survived: number, other: string[] = []) => ({
  mutants: [...Array(killed).fill({ status: "Killed" }), ...Array(survived).fill({ status: "Survived" }), ...other.map((status) => ({ status }))]
});
const input = (over: Partial<QualityInput> = {}): QualityInput => ({
  commit: COMMIT,
  report: { files: { "packages/jsr/model/src/utils/lo-utils.ts": mutants(3, 1) } },
  deployed: { tag: "16.2.2", deployedAt: "2026-09-21T10:57:28Z", commit: "caa53d021e63004ad6e52a76428f8acd95a87c21" },
  diff: () => [],
  generatedAt: "2026-09-30T03:00:00Z",
  ...over
});

describe("moduleStatuses", () => {
  it("keys absolute paths repo-relative, as moduleScores does", () => {
    const report: MutationReport = { files: { [resolve(REPO_ROOT, "packages/jsr/model/src/tutors.ts")]: mutants(1, 1, ["NoCoverage"]) } };
    expect(moduleStatuses(report)).toEqual({ "packages/jsr/model/src/tutors.ts": ["Killed", "Survived", "NoCoverage"] });
    expect(moduleScores(report)).toEqual({ "packages/jsr/model/src/tutors.ts": 33.33 });
  });
});

describe("packageOf", () => {
  it("is the nearest package.json, nested packages included", () => {
    expect(packageOf("packages/jsr/model/src/utils/lo-utils.ts")).toEqual({ name: "@tutors/tutors-model-lib", path: "packages/jsr/model" });
    expect(packageOf("packages/svelte/utils/a11y/src/index.ts").path).toBe("packages/svelte/utils/a11y");
  });

  it("falls back to the module itself below no package, never to the repository root", () => {
    expect(packageOf("nowhere/src/x.ts")).toEqual({ name: "nowhere/src/x.ts", path: "nowhere/src/x.ts" });
  });

  it("names a package with no name by its directory", () => {
    const root = mkdtempSync(join(tmpdir(), "quality-"));
    try {
      mkdirSync(join(root, "pkg/src"), { recursive: true });
      writeFileSync(join(root, "pkg/package.json"), "{}");
      expect(packageOf("pkg/src/a.ts", root)).toEqual({ name: "pkg", path: "pkg" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("jobResults and nightResult", () => {
  it("reads toJSON(needs) and a plain map", () => {
    expect(jobResults('{"a":{"result":"success","outputs":{}},"b":{"result":"skipped","outputs":{}}}')).toEqual({ a: "success", b: "skipped" });
    expect(jobResults('{"a":"failure"}')).toEqual({ a: "failure" });
  });

  it("refuses anything else", () => {
    expect(() => jobResults("[]")).toThrow("expected a JSON object");
    expect(() => jobResults("null")).toThrow("expected a JSON object");
    expect(() => jobResults('{"a":{"outputs":{}}}')).toThrow("no result for the job a");
    expect(() => jobResults('{"a":null}')).toThrow("no result for the job a");
  });

  it("fails the night on a failed or cancelled job, not on a skipped one", () => {
    expect(nightResult({ a: "success", b: "skipped" })).toBe("success");
    expect(nightResult({ a: "success", b: "cancelled" })).toBe("failure");
    expect(nightResult({ a: "failure" })).toBe("failure");
    expect(nightResult({})).toBe("success");
  });
});

describe("qualityRecord", () => {
  it("writes the harness's test-signal shape with the extra fields", () => {
    const record = qualityRecord(input({ evidence: "https://example.test/run/1", jobs: { a: "success" } }));
    expect(record).toEqual({
      schemaVersion: 1,
      commit: COMMIT,
      base: "caa53d021e63004ad6e52a76428f8acd95a87c21",
      generatedAt: "2026-09-30T03:00:00Z",
      evidence: "https://example.test/run/1",
      packages: [{ name: "@tutors/tutors-model-lib", mutationScore: 75, changed: false, path: "packages/jsr/model" }],
      nightly: { result: "success", jobs: { a: "success" } }
    } satisfies QualityRecord);
  });

  it("scores over mutants, not the mean of modules, and ignores errors like Stryker", () => {
    const record = qualityRecord(
      input({
        report: {
          files: {
            "packages/jsr/model/src/utils/lo-utils.ts": mutants(1, 0),
            "packages/jsr/model/src/services/search.ts": mutants(0, 2, ["CompileError", "Ignored"]),
            "packages/jsr/model/src/tutors.ts": { mutants: [{ status: "Timeout" }] }
          }
        }
      })
    );
    expect(record.packages).toEqual([{ name: "@tutors/tutors-model-lib", mutationScore: 50, changed: false, path: "packages/jsr/model" }]);
  });

  it("sorts packages by name and matches a changed file by directory, not by prefix", () => {
    const record = qualityRecord(
      input({
        report: { files: { "packages/svelte/utils/a11y/src/a.ts": mutants(1, 0), "packages/jsr/model/src/tutors.ts": mutants(1, 0) } },
        diff: () => ["packages/jsr/modelling/x.ts", "packages/svelte/utils/a11y/src/a.ts"]
      })
    );
    expect(record.packages!.map((p) => [p.path, p.changed])).toEqual(
      [...record.packages!].sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.path, p.changed])
    );
    expect(Object.fromEntries(record.packages!.map((p) => [p.path, p.changed]))).toEqual({
      "packages/jsr/model": false,
      "packages/svelte/utils/a11y": true
    });
  });

  it("counts every package as changed and records no base when git cannot diff", () => {
    const record = qualityRecord(input({ diff: () => undefined }));
    expect(record.base).toBeNull();
    expect(record.packages!.every((p) => p.changed)).toBe(true);
  });

  it("asks git for the named base, else production", () => {
    const asked: string[] = [];
    qualityRecord(input({ since: "v16.2.1", diff: (b) => (asked.push(b), []) }));
    qualityRecord(input({ diff: (b) => (asked.push(b), []) }));
    qualityRecord(input({ deployed: undefined, diff: (b) => (asked.push(b), []) }));
    expect(asked).toEqual(["v16.2.1", "caa53d021e63004ad6e52a76428f8acd95a87c21"]);
  });

  it("leaves out evidence and nightly when not given", () => {
    const record = qualityRecord(input());
    expect(record).not.toHaveProperty("evidence");
    expect(record).not.toHaveProperty("nightly");
  });
});

describe("pnpm release:quality", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes quality.json from a report, a base and the job results", () => {
    dir = mkdtempSync(join(tmpdir(), "quality-"));
    const report = join(dir, "mutation.json");
    writeFileSync(report, JSON.stringify({ files: { "packages/jsr/model/src/tutors.ts": mutants(4, 1) } }));
    const out = join(dir, "quality.json");
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    execFileSync("pnpm", ["exec", "tsx", "scripts/checks/release-quality.ts", "--report", report, "--since", "HEAD", "--jobs", '{"load":{"result":"failure"}}', "--out", out], {
      cwd: REPO_ROOT,
      stdio: "pipe"
    });
    const record = JSON.parse(readFileSync(out, "utf8")) as QualityRecord;
    expect(record).toMatchObject({
      commit: head,
      base: "HEAD",
      packages: [{ name: "@tutors/tutors-model-lib", mutationScore: 80, changed: false }],
      nightly: { result: "failure", jobs: { load: "failure" } }
    });
  });

  it("writes no packages when the report is absent", () => {
    dir = mkdtempSync(join(tmpdir(), "quality-"));
    const out = join(dir, "quality.json");
    execFileSync("pnpm", ["exec", "tsx", "scripts/checks/release-quality.ts", "--report", join(dir, "absent.json"), "--since", "HEAD", "--out", out], {
      cwd: REPO_ROOT,
      stdio: "pipe"
    });
    expect(JSON.parse(readFileSync(out, "utf8"))).not.toHaveProperty("packages");
  });
});
