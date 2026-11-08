import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exitCodeFor, jsonReport, MemoryFileSystem, report, rulesVersion, sarifReport, textReport, validate, type Finding } from "../../../packages/jsr/course-rules/src/mod.ts";
import { generateCourseFiles } from "../../../packages/jsr/create/src/generate.ts";
import { defaultSpec, type CourseSpec } from "../../../packages/jsr/create/src/types.ts";
import { parseValidateArgs, runValidate, validateUsage } from "../../../packages/jsr/create/src/validate-cli.ts";

const f = (rule: Finding["rule"], severity: Finding["severity"], path: string, message = "m"): Finding => ({ rule, severity, path, message });

describe("reports", () => {
  it("text: one line per finding naming the course folder for the root, then a verdict", () => {
    expect(textReport([f("V001", "error", ""), f("V002", "warn", "Week 3", "won't appear")])).toBe(
      "error V001 (course folder): m\nwarn  V002 Week 3: won't appear\n1 error, 1 warning. Fix the errors before publishing.\n"
    );
    expect(textReport([f("V002", "warn", "a"), f("V003", "warn", "b")])).toBe("warn  V002 a: m\nwarn  V003 b: m\n0 errors, 2 warnings.\n");
    expect(textReport([])).toBe("Everything checks out.\n");
  });

  it("json: the findings array, as-is", () => {
    const findings = [f("V002", "error", "Week 3")];
    expect(JSON.parse(jsonReport(findings))).toEqual(findings);
    expect(JSON.parse(report(findings, "json", "x"))).toEqual(findings);
  });

  it("sarif: rules from the catalogue, levels mapped, the root located at course.md, paths under the folder given", () => {
    const log = JSON.parse(sarifReport([f("V001", "error", ""), f("V002", "warn", "Week 3"), f("V003", "info", "unit-1")], "9.9.9", "courses/web/"));
    const run = log.runs[0];
    expect(log.$schema).toContain("sarif-2.1.0");
    expect(run.tool.driver).toMatchObject({ name: "tutors validate", version: "9.9.9" });
    expect(run.tool.driver.rules.map((r: { id: string }) => r.id)).toEqual(Array.from({ length: 17 }, (_, i) => `V${String(i + 1).padStart(3, "0")}`));
    expect(run.tool.driver.rules[0].defaultConfiguration.level).toBe("error");
    expect(run.results.map((r: { level: string }) => r.level)).toEqual(["error", "warning", "note"]);
    expect(run.results.map((r: { locations: { physicalLocation: { artifactLocation: { uri: string } } }[] }) => r.locations[0].physicalLocation.artifactLocation.uri)).toEqual([
      "courses/web/course.md",
      "courses/web/Week 3",
      "courses/web/unit-1"
    ]);
    expect(run.results[1].message.text).toBe("m");
    expect(JSON.parse(sarifReport([f("V002", "error", "a")], "1", ".")).runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe("a");
    expect(JSON.parse(report([f("V002", "error", "a")], "sarif", "1")).version).toBe("2.1.0");
    expect(report([], "text", "1")).toBe("Everything checks out.\n");
  });

  it("exit codes: errors 1, warnings 2 only when strict, else 0", () => {
    expect(exitCodeFor([f("V001", "error", ""), f("V002", "warn", "a")], true)).toBe(1);
    expect(exitCodeFor([f("V002", "warn", "a")], true)).toBe(2);
    expect(exitCodeFor([f("V002", "warn", "a")], false)).toBe(0);
    expect(exitCodeFor([f("V002", "info", "a")], true)).toBe(0);
    expect(exitCodeFor([], true)).toBe(0);
  });

  it("rulesVersion matches deno.json", () => {
    expect(rulesVersion).toBe(JSON.parse(readFileSync("packages/jsr/course-rules/deno.json", "utf-8")).version);
  });
});

describe("tutors validate arguments", () => {
  it("defaults to the current folder, text, not strict, no fixes", () => {
    expect(parseValidateArgs([])).toEqual({ dir: ".", format: "text", strict: false, fix: false });
    expect(parseValidateArgs(["web", "--format=sarif", "--strict"])).toEqual({ dir: "web", format: "sarif", strict: true, fix: false });
    expect(parseValidateArgs(["--format", "json", "web", "--fix"])).toEqual({ dir: "web", format: "json", strict: false, fix: true });
  });

  it("refuses an unknown format or option, a missing format and two folders, with the usage", () => {
    expect(parseValidateArgs(["--format", "xml"])).toBe(`Unknown format "xml". ${validateUsage}`);
    expect(parseValidateArgs(["--format"])).toBe(`Unknown format "". ${validateUsage}`);
    expect(parseValidateArgs(["--fixes"])).toBe(`Unknown option "--fixes". ${validateUsage}`);
    expect(parseValidateArgs(["a", "b"])).toBe(`Give one folder, not two. ${validateUsage}`);
  });

  it("wrong arguments exit 3 and print nothing to standard output", async () => {
    let out = "";
    let err = "";
    expect(await runValidate(["--nope"], { out: (t) => (out += t), err: (t) => (err += t) })).toBe(3);
    expect(out).toBe("");
    expect(err).toContain("Unknown option");
  });

  it("an error that is not an Error is still reported", async () => {
    let err = "";
    const status = await runValidate(["x"], {
      out: () => {},
      err: (t) => (err += t),
      check: () => Promise.reject("boom")
    });
    expect(status).toBe(3);
    expect(err).toBe("Couldn't read the course folder x: boom\n");
  });
});

describe("every course tutors-create generates validates clean", () => {
  const flags = ["includeSide", "includeNotes", "includeLabs", "includeCalendar", "includeEnrollment", "includeGitignore", "includeReadme"] as const;
  const combos: CourseSpec[] = [];
  for (let mask = 0; mask < 1 << flags.length; mask += 9) {
    const spec: CourseSpec = { ...defaultSpec, unitCount: 1 + (mask % 3), topicsPerUnit: 1 + (mask % 4) };
    flags.forEach((flag, i) => (spec[flag] = Boolean(mask & (1 << i))));
    combos.push(spec);
  }

  it.each(combos.map((spec, i) => ({ i, spec })))("option set $i", async ({ spec }) => {
    const files = Object.fromEntries(generateCourseFiles(spec).map((file) => [file.relativePath, file.content]));
    expect(await validate(new MemoryFileSystem(files))).toEqual([]);
  });
});
