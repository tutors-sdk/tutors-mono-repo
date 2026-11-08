export type Severity = "error" | "warn" | "info";

export type RuleId = "V001" | "V002" | "V003" | "V004" | "V005" | "V006" | "V007" | "V008" | "V009" | "V010" | "V011" | "V012";

/**
 * One change to a course folder. A fix is planned as file operations first and applied only when the
 * lecturer (or `--fix`) accepts it, so nothing is ever written behind their back.
 */
export type FileOp = { op: "move"; from: string; to: string } | { op: "write"; path: string; content: string };

/** One problem with a course, in the shape every shell renders: the CLI's text and JSON, Studio's badges, SARIF. */
export interface Finding {
  rule: RuleId;
  severity: Severity;
  /** The file or folder at fault, relative to the course root; "" is the root itself. */
  path: string;
  /** What is wrong and what to do, written for a lecturer (from messages.ts). */
  message: string;
  /** A rename the lecturer could make, when one is obvious. */
  suggestedName?: string;
  /** The safe fix, when there is one: what `tutors validate --fix` and Studio's "Fix" apply. */
  fix?: FileOp;
}

export interface RuleInfo {
  id: RuleId;
  severity: Severity;
  summary: string;
}

/** The first release's catalogue. Ids are stable: EARS Rules, docs and Studio cite them. */
export const ruleCatalogue: readonly RuleInfo[] = [
  { id: "V001", severity: "error", summary: "The course folder has a course.md" },
  { id: "V002", severity: "error", summary: "Every folder's name starts with a learning-object kind, is hidden, or holds only images" },
  { id: "V003", severity: "error", summary: "Every unit, side and topic has a descriptor .md" },
  { id: "V004", severity: "error", summary: "Talks, notes and labs hold the files their kind needs" },
  { id: "V005", severity: "error", summary: "Web and GitHub links hold a URL or repository in their link file" },
  { id: "V006", severity: "error", summary: "properties.yaml, calendar.yaml, enrollment.yaml and badges.yaml parse and have the expected shape" },
  { id: "V007", severity: "warn", summary: "Folder names are lower-case ASCII with no spaces, and file names are ASCII with no spaces" },
  { id: "V008", severity: "warn", summary: "Every card's .md has a title on its first line" },
  { id: "V009", severity: "warn", summary: "Images a .md file shows exist and are under 2 MB" },
  { id: "V010", severity: "warn", summary: "Topics side by side are numbered in sequence (topic-01, topic-02, ...)" },
  { id: "V011", severity: "warn", summary: "A netlify.toml publishes the generated json or html folder" },
  { id: "V012", severity: "info", summary: "A unit, side or topic holds something" }
];

export function severityOf(rule: RuleId): Severity {
  return ruleCatalogue.find((info) => info.id === rule)!.severity;
}
