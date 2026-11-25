import type { Finding } from "@tutors/course-rules";

/** "2 errors, 1 warning", or the all-clear: the headline above a list of findings. */
export function findingsHeadline(findings: readonly Finding[]): string {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warn").length;
  if (errors + warnings === 0) return "No problems found.";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(errors, "error")}, ${plural(warnings, "warning")}.${errors > 0 ? " Fix the errors before publishing." : ""}`;
}
