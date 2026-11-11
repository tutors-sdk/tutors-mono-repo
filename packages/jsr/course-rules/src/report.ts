import type { Finding } from "./finding.ts";
import { ruleCatalogue } from "./finding.ts";
import { trimRuns } from "./trim.ts";

export type ReportFormat = "text" | "json" | "sarif";

const where = (path: string) => (path === "" ? "(course folder)" : path);

/** Human text: one line per finding, a one-line verdict, then how many --fix can fix. What the CLI prints by default. */
export function textReport(findings: readonly Finding[]): string {
  const lines = findings.map((f) => `${f.severity.padEnd(5)} ${f.rule} ${where(f.path)}: ${f.message}`);
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warn").length;
  const verdict =
    errors + warnings === 0
      ? "Everything checks out."
      : `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}.${errors > 0 ? " Fix the errors before publishing." : ""}`;
  // Courses written before validate ran in every deploy often fail only on renames; say that one command does them.
  const fixable = findings.filter((f) => f.fix !== undefined).length;
  const fixes = fixable === 0 ? [] : [`${findings.length === 1 ? "It" : `${fixable} of these`} can be fixed for you: run tutors validate --fix.`];
  return [...lines, verdict, ...fixes].join("\n") + "\n";
}

/** The contract Studio and CI consume: a JSON array, one object per finding, in the Finding shape. */
export function jsonReport(findings: readonly Finding[]): string {
  return JSON.stringify(findings, null, 2) + "\n";
}

const sarifLevel = { error: "error", warn: "warning", info: "note" } as const;

/**
 * SARIF 2.1.0, so a GitHub code-scanning upload shows each finding on the pull request's Files tab.
 * A finding on the course folder itself is located at course.md.
 */
export function sarifReport(findings: readonly Finding[], version: string, root = ""): string {
  const prefix = root === "" || root === "." ? "" : `${trimRuns(root, "/", false)}/`;
  const log = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "tutors validate",
            informationUri: "https://github.com/tutors-sdk/tutors-mono-repo/tree/main/packages/jsr/course-rules",
            version,
            rules: ruleCatalogue.map((rule) => ({ id: rule.id, shortDescription: { text: rule.summary }, defaultConfiguration: { level: sarifLevel[rule.severity] } }))
          }
        },
        results: findings.map((f) => ({
          ruleId: f.rule,
          level: sarifLevel[f.severity],
          message: { text: f.message },
          locations: [{ physicalLocation: { artifactLocation: { uri: prefix + (f.path === "" ? "course.md" : f.path) } } }]
        }))
      }
    ]
  };
  return JSON.stringify(log, null, 2) + "\n";
}

export function report(findings: readonly Finding[], format: ReportFormat, version: string, root = ""): string {
  if (format === "json") return jsonReport(findings);
  if (format === "sarif") return sarifReport(findings, version, root);
  return textReport(findings);
}

export type ExitCode = 0 | 1 | 2 | 3;

/** 0 clean, 1 errors, 2 warnings under --strict. (3, could not read the folder, is the shell's to return.) */
export function exitCodeFor(findings: readonly Finding[], strict: boolean): ExitCode {
  if (findings.some((f) => f.severity === "error")) return 1;
  if (strict && findings.some((f) => f.severity === "warn")) return 2;
  return 0;
}
