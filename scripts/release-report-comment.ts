/**
 * Turn the release harness's verdict into the one comment on the release pull request that
 * .github/workflows/release-harness-report.yml keeps up to date.
 *
 * The harness (tutors-sdk/tutors-release-harness) never writes to a pull request: it writes report.md and
 * report.json into the `release-report` artifact of its release.yml run and to that run's job summary. This script
 * holds the parts of "post it here instead" that can be tested without GitHub: recognising the run, reading the
 * report, mapping it to a verdict, rendering the comment and choosing which comment to update. The workflow does the
 * waiting and the API calls with `gh`.
 *
 *   tsx scripts/release-report-comment.ts find-run     --runs runs.json --candidate 16.3.0-rc.1 --dispatched-at 2026-09-21T10:00:00Z
 *   tsx scripts/release-report-comment.ts render       --candidate 16.3.0-rc.1 --run run.json --report-dir dir --out body.md [--state timeout]
 *   tsx scripts/release-report-comment.ts pick-comment --comments comments.json
 *
 * Everything read from the harness's run, jobs and report is DATA. It came out of a browser session against the
 * candidate's own pages, so a page can put anything into a hunk's summary. Text is never rendered as Markdown or HTML
 * as it arrived: `text()` escapes HTML, breaks `@mentions`, `#123` references, links and table syntax, drops control
 * characters and caps the length, and the whole comment is capped below GitHub's limit. Links are built here from
 * numeric ids, never taken from the report.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The first line of the comment: how the workflow finds the comment it owns. One comment per pull request. */
export const MARKER = "<!-- tutors-release-harness-report -->";
export const HARNESS_REPO = "tutors-sdk/tutors-release-harness";
/** Name of the artifact release.yml uploads `out/` to (docs/contract/workflows.json in the harness). */
export const REPORT_ARTIFACT = "release-report";
/** GitHub rejects a comment over 65536 characters; stay well under. */
export const MAX_COMMENT_CHARS = 60_000;
export const DEFAULT_MAX_HUNKS = 10;
/** How long the workflow waits for the harness run, in minutes. */
export const WAIT_MINUTES = 45;
/** The only author whose comment is ever updated: the workflow's own token. */
export const COMMENT_AUTHOR = "github-actions[bot]";

/** Zero-width space: invisible, and enough to stop GitHub linking what follows an @ or a #. */
const ZWSP = String.fromCharCode(0x200b);
/** X.Y.Z or X.Y.Z-rc.N: what release-dispatch.yml tags. */
const CANDIDATE = /^\d+\.\d+\.\d+(-rc\.\d+)?$/;
const ELLIPSIS = String.fromCharCode(0x2026);
const APP_ORDER = ["reader", "catalogue", "live", "time"];

// ---- untrusted text --------------------------------------------------------------------------------------

/** C0 controls (but not tab or newline, which whitespace collapsing handles), DEL, and the Unicode line and paragraph separators. */
function isControl(code: number): boolean {
  return (code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f || code === 0x2028 || code === 0x2029;
}

/**
 * Text from the harness, made safe to put in a Markdown table cell or list item: one line, HTML escaped, no
 * `@mention` (a zero-width space after the @, which also breaks `@org/team`), no `#123` issue link, no clickable
 * URL or Markdown link, no `|` to break a table, no backtick to open a code span, control characters dropped, and at
 * most `max` characters.
 */
export function text(value: unknown, max = 300): string {
  let out = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  out = Array.from(out, (ch) => (isControl(ch.codePointAt(0) ?? 0) ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (out.length > max) out = `${out.slice(0, Math.max(0, max - 1))}${ELLIPSIS}`;
  return out
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "'")
    .replaceAll("|", "\\|")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("@", `@${ZWSP}`)
    .replaceAll("://", `:${ZWSP}//`)
    .replace(/#(?=\d)/g, `#${ZWSP}`);
}

/** `text()` in a code span; a digest or an image reference reads better that way. */
export function code(value: unknown, max = 200): string {
  const inner = text(value, max);
  return inner === "" ? "-" : `\`${inner}\``;
}

// ---- the harness's run --------------------------------------------------------------------------------------

export interface WorkflowRun {
  id: number;
  name?: string | null;
  display_title?: string | null;
  created_at?: string;
  status?: string | null;
  conclusion?: string | null;
  event?: string;
}

export interface RunMatch {
  status: "found" | "none" | "ambiguous";
  run?: WorkflowRun;
  /** run-name: the run's title names the candidate. time-window: nothing named it, and it is the only run that started in the window. */
  how?: "run-name" | "time-window";
  /** Why nothing was chosen, for the job summary. */
  detail: string;
}

/** Runs may have started up to this long before `dispatched_at` is taken (clock skew between the two hosts). */
export const SKEW_MS = 2 * 60_000;
/** A run this long after the dispatch is not the one the dispatch started. */
export const WINDOW_MS = 15 * 60_000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does a title name this candidate as a whole tag: `release 16.3.0-rc.1` yes, `release 16.3.0-rc.10` no. */
export function titleNames(title: string, candidate: string): boolean {
  return new RegExp(`(^|[^0-9A-Za-z.-])v?${escapeRegExp(candidate)}($|[^0-9A-Za-z-]|\\.(?![0-9A-Za-z]))`).test(title);
}

/** The shape of the run-name the harness should set: `release <candidate>`. Such a title names another candidate. */
function namesSomeCandidate(title: string): boolean {
  return /^release v?\d+\.\d+\.\d+/.test(title);
}

/**
 * Which of the harness's `release.yml` runs did this dispatch start?
 *
 * 1. Runs whose title names the candidate (the harness's `run-name: release <candidate>`), among those that started
 *    no earlier than the dispatch (less the skew). The earliest wins: a later one is a re-dispatch of the same tag.
 * 2. When no title names it (a harness without that run-name, whose runs are titled by a commit message), the runs
 *    started by a `repository_dispatch` in the window after the dispatch, that no title names another candidate.
 *    Exactly one is taken, and the caller checks the report it produced names the candidate; two or more is
 *    ambiguous and nothing is guessed.
 */
export function matchRun(runs: readonly WorkflowRun[], candidate: string, dispatchedAt: string, now: number = Date.now()): RunMatch {
  const since = Date.parse(dispatchedAt);
  if (!Number.isFinite(since)) return { status: "none", detail: `dispatched_at '${text(dispatchedAt, 40)}' is not a time` };
  const eligible = runs
    .filter((run) => Number.isInteger(run.id) && Date.parse(run.created_at ?? "") >= since - SKEW_MS)
    .sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? "") || a.id - b.id);
  const title = (run: WorkflowRun): string => run.display_title ?? run.name ?? "";

  const named = eligible.filter((run) => titleNames(title(run), candidate));
  if (named.length > 0) return { status: "found", run: named[0], how: "run-name", detail: `run ${named[0].id} is titled for ${candidate}` };

  const windowed = eligible.filter(
    (run) => (run.event === undefined || run.event === "repository_dispatch") && Date.parse(run.created_at ?? "") <= since + WINDOW_MS && !namesSomeCandidate(title(run))
  );
  if (windowed.length === 1) {
    return { status: "found", run: windowed[0], how: "time-window", detail: `no run is titled for ${candidate}; run ${windowed[0].id} is the only one that started after the dispatch` };
  }
  if (windowed.length > 1) {
    return { status: "ambiguous", detail: `no run is titled for ${candidate} and ${windowed.length} started after the dispatch (${windowed.map((r) => r.id).join(", ")}); the harness needs \`run-name: release \${{ github.event.client_payload.candidate }}\`` };
  }
  return { status: "none", detail: now - since > WINDOW_MS ? `no run of the harness's release.yml started after ${dispatchedAt}` : "the harness run has not started yet" };
}

// ---- the report ---------------------------------------------------------------------------------------------

export interface Hunk {
  id?: string;
  artefact?: string;
  scope?: string;
  summary?: string;
  severity?: string;
}

export interface HarnessReport {
  schemaVersion?: number;
  harness?: { version?: string; contractVersion?: string };
  mode?: string;
  ranAt?: string;
  runs?: number;
  sides?: { a?: Record<string, string>; b?: Record<string, string> };
  provenance?: { a?: { images?: Record<string, { digest?: string; provenance?: string }> }; b?: { images?: Record<string, { digest?: string; provenance?: string }> } };
  verdict?: string;
  reasons?: string[];
  compare?: {
    hunks?: Hunk[];
    matches?: Array<{ hunk?: Hunk; claim?: unknown }>;
    unclaimed?: Hunk[];
    staleClaims?: unknown[];
    broadUnapproved?: unknown[];
  };
  override?: { reason?: string; by?: string; verdict?: string; applied?: boolean };
}

/** A release-mode report.json this script understands, or undefined. */
export function asReleaseReport(value: unknown): HarnessReport | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const report = value as HarnessReport;
  if (report.schemaVersion !== 1 || report.mode !== "release") return undefined;
  if (report.verdict !== "pass" && report.verdict !== "warn" && report.verdict !== "fail") return undefined;
  return report;
}

/** The release-mode report.json in an unpacked artifact: `<timestamp>-release/report.json`, wherever it sits. */
export function findReport(dir: string): HarnessReport | undefined {
  if (!existsSync(dir)) return undefined;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name === "report.json") {
        try {
          const report = asReleaseReport(JSON.parse(readFileSync(path, "utf8")));
          if (report) return report;
        } catch {
          // not JSON: not the report
        }
      }
    }
  }
  return undefined;
}

/** Does the report say it judged this candidate as side b? Side b's image references end in `:<candidate>` (or `:<candidate>@sha256:...`). */
export function reportNamesCandidate(report: HarnessReport, candidate: string): boolean {
  return Object.values(report.sides?.b ?? {}).some((ref) => typeof ref === "string" && new RegExp(`:v?${escapeRegExp(candidate)}(@|$)`).test(ref));
}

export type Outcome = "pass" | "warn" | "fail" | "fail-overridden" | "could-not-judge" | "pending";

export interface Judgement {
  outcome: Outcome;
  /** The harness's exit code, derived: report.json does not record it. */
  exitCode: 0 | 1 | 2 | undefined;
  label: string;
}

/**
 * The harness's verdict as the comment states it. Exit codes are the contract's: pass and warn exit 0, a fail exits 1
 * unless it was overridden, and no report means no verdict was reached (2: the harness failed or an image may not be
 * judged). `pending` is a run that had not finished, which has no exit code yet.
 */
export function judge(report: HarnessReport | undefined, pending = false): Judgement {
  if (pending) return { outcome: "pending", exitCode: undefined, label: "PENDING" };
  if (!report) return { outcome: "could-not-judge", exitCode: 2, label: "COULD NOT JUDGE" };
  if (report.verdict === "fail") {
    return report.override?.applied === true
      ? { outcome: "fail-overridden", exitCode: 0, label: "FAIL (overridden)" }
      : { outcome: "fail", exitCode: 1, label: "FAIL" };
  }
  if (report.verdict === "warn") return { outcome: "warn", exitCode: 0, label: "WARN (advisory)" };
  return { outcome: "pass", exitCode: 0, label: "PASS" };
}

const EXPLANATION: Record<Outcome, string> = {
  pass: "Every observable difference between production and the candidate is claimed in `release/claims.yaml`.",
  warn: "Advisory, exit code 0: nothing is blocked. The harness found what it would fail on, or could not confirm something, but it is not yet licensed to fail (see the reasons below). Read the unclaimed differences as if it had failed.",
  fail: "The candidate differs from production in ways `release/claims.yaml` does not claim. Fix the difference, or claim it with its Rule or CHANGELOG entry, and push again.",
  "fail-overridden": "The harness failed and a maintainer overrode it when dispatching by hand. The verdict below is the harness's own.",
  "could-not-judge": "The harness reached no verdict (exit code 2: it failed, or an image may not be judged). This is **not** a pass: nothing was compared. Open the run for the reason.",
  pending: `The harness run had not finished after ${WAIT_MINUTES} minutes. This comment is updated when a later run of this workflow finds it done; until then the run itself is the source of truth.`
};

// ---- the comment ----------------------------------------------------------------------------------------------

export interface JobInfo {
  name?: string;
  conclusion?: string | null;
  status?: string;
}

export interface CommentInput {
  candidate: string;
  production?: string;
  runId: number;
  /** The artifact's id when the run has a `release-report` artifact. */
  artifactId?: number;
  report?: HarnessReport;
  jobs?: readonly JobInfo[];
  pending?: boolean;
  /** How the run was found; a time-window match is said out loud. */
  how?: RunMatch["how"];
  /** The harness run's conclusion, when it has one. */
  runConclusion?: string | null;
  now?: Date;
}

export interface RenderOptions {
  maxHunks?: number;
  maxChars?: number;
}

export function runUrl(runId: number): string {
  return `https://github.com/${HARNESS_REPO}/actions/runs/${runId}`;
}

function appRows(report: HarnessReport): string[] {
  const apps = [...new Set([...Object.keys(report.sides?.a ?? {}), ...Object.keys(report.sides?.b ?? {})])].sort(
    (x, y) => (APP_ORDER.indexOf(x) === -1 ? 99 : APP_ORDER.indexOf(x)) - (APP_ORDER.indexOf(y) === -1 ? 99 : APP_ORDER.indexOf(y)) || x.localeCompare(y)
  );
  const digest = (side: "a" | "b", app: string): string => {
    const fromProvenance = report.provenance?.[side]?.images?.[app]?.digest;
    if (typeof fromProvenance === "string") return fromProvenance;
    return /@(sha256:[0-9a-f]{64})$/.exec(report.sides?.[side]?.[app] ?? "")?.[1] ?? "";
  };
  return apps.map((app) => {
    const cell = (side: "a" | "b"): string => {
      const ref = (report.sides?.[side]?.[app] ?? "-").replace(/@sha256:[0-9a-f]{64}$/, "");
      const d = digest(side, app);
      return d ? `${code(ref)}<br>${code(d, 80)}` : code(ref);
    };
    return `| ${text(app, 20)} | ${cell("a")} | ${cell("b")} |`;
  });
}

function jobLine(jobs: readonly JobInfo[]): string {
  const parts = jobs
    .filter((job) => /^(release|migration|upgrade)\b/i.test(job.name ?? ""))
    .map((job) => `${text((job.name ?? "").replace(/\s*\(.*$/, ""), 40)}: ${text(job.conclusion ?? job.status ?? "unknown", 20)}`);
  return parts.join(", ");
}

/** The comment body: the marker, the verdict, and what a reviewer needs to act on it. */
export function renderComment(input: CommentInput, options: RenderOptions = {}): string {
  const maxHunks = options.maxHunks ?? DEFAULT_MAX_HUNKS;
  const maxChars = options.maxChars ?? MAX_COMMENT_CHARS;
  const report = input.report;
  const verdict = judge(report, input.pending === true);
  const lines: string[] = [MARKER, `## Release harness: ${verdict.label}, ${code(`v${input.candidate}`)}`, "", EXPLANATION[verdict.outcome], ""];

  if (verdict.outcome === "fail-overridden" && report?.override) {
    lines.push(`Overridden by ${code(report.override.by, 60)}: ${text(report.override.reason, 300)}`, "");
  }

  const artifact = input.artifactId !== undefined && Number.isInteger(input.artifactId) ? `[${REPORT_ARTIFACT}](${runUrl(input.runId)}/artifacts/${input.artifactId})` : `not found (${REPORT_ARTIFACT})`;
  const facts: Array<[string, string]> = [
    ["Verdict", `**${verdict.label}**`],
    ["Exit code", verdict.exitCode === undefined ? "not finished" : `${verdict.exitCode} (derived from the verdict; \`report.json\` does not record it)`],
    ["Harness", report?.harness?.version ? `${code(report.harness.version, 30)} (contract ${code(report.harness.contractVersion, 30)})` : "unknown"],
    ["Candidate (b)", code(input.candidate, 40)],
    ["Production (a)", input.production ? code(input.production, 40) : "-"],
    ["Runs per side", report?.runs !== undefined ? text(report.runs, 10) : "-"],
    ["Judged at", report?.ranAt ? code(report.ranAt, 40) : "-"],
    ["Harness run", `[${input.runId}](${runUrl(input.runId)})${input.runConclusion ? ` (${text(input.runConclusion, 20)})` : ""}`],
    ["Report artifact", artifact]
  ];
  lines.push("| | |", "| --- | --- |", ...facts.map(([k, v]) => `| ${k} | ${v} |`), "");

  if (input.how === "time-window") {
    lines.push("The harness run was matched by start time, not by name: its workflow has no `run-name` naming the candidate. See the guide.", "");
  }

  if (report) {
    const hunks = report.compare?.hunks ?? [];
    const claimed = (report.compare?.matches ?? []).filter((m) => m.claim !== undefined && m.claim !== null).length;
    const unclaimed = report.compare?.unclaimed ?? [];
    const stale = report.compare?.staleClaims ?? [];
    const broad = report.compare?.broadUnapproved ?? [];
    lines.push(
      "| Differences | Claimed | Unclaimed | Stale claims | Broad claims without approval |",
      "| ---: | ---: | ---: | ---: | ---: |",
      `| ${hunks.length} | ${claimed} | ${unclaimed.length} | ${stale.length} | ${broad.length} |`,
      ""
    );

    if ((report.sides?.a && Object.keys(report.sides.a).length > 0) || (report.sides?.b && Object.keys(report.sides.b).length > 0)) {
      lines.push("### Images judged", "", "| app | production (a) | candidate (b) |", "| --- | --- | --- |", ...appRows(report), "");
    }

    if (unclaimed.length > 0) {
      const shown = unclaimed.slice(0, maxHunks);
      lines.push(`### Unclaimed differences (${shown.length} of ${unclaimed.length})`, "");
      for (const hunk of shown) {
        lines.push(`- ${code(hunk.artefact, 30)} ${code(hunk.scope, 120)}: ${text(hunk.summary, 300)}`);
      }
      if (unclaimed.length > shown.length) lines.push(`- ... and ${unclaimed.length - shown.length} more in the report`);
      lines.push("");
    }

    const reasons = (report.reasons ?? []).slice(0, 6);
    if (reasons.length > 0) {
      lines.push("### Reasons", "", ...reasons.map((reason) => `- ${text(reason, 300)}`), "");
    }
  }

  const other = jobLine(input.jobs ?? []);
  if (other) lines.push(`Jobs of the run: ${other}`, "");

  lines.push(
    `<sub>Posted by \`release-harness-report.yml\` and updated in place; the harness itself never writes to pull requests. Everything above the run link is copied from the harness's report as data. ${(input.now ?? new Date()).toISOString()}</sub>`
  );

  let body = lines.join("\n");
  if (body.length > maxChars) {
    const note = `\n\n_The comment was cut at ${maxChars} characters; the artifact has the whole report._`;
    body = `${body.slice(0, Math.max(0, maxChars - note.length)).replace(/\n[^\n]*$/, "")}${note}`;
  }
  return body;
}

// ---- which comment ------------------------------------------------------------------------------------------------

export interface IssueComment {
  id: number;
  body?: string | null;
  user?: { login?: string; type?: string } | null;
}

/**
 * The comment to update: the oldest that starts with the marker and was written by the workflow's own token. A comment
 * by anyone else that quotes the marker is not ours, and is never edited.
 */
export function pickComment(comments: readonly IssueComment[]): number | undefined {
  const own = comments
    .filter((c) => Number.isInteger(c.id) && c.user?.login === COMMENT_AUTHOR && (c.body ?? "").trimStart().startsWith(MARKER))
    .sort((a, b) => a.id - b.id);
  return own[0]?.id;
}

// ---- command line ------------------------------------------------------------------------------------------------------

/** A JSON file as `gh api` writes it: one document, an array, or (with --paginate --jq) one document per line. */
export function readLooseJson(file: string): unknown[] {
  const raw = readFileSync(file, "utf8").trim();
  if (raw === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as unknown);
  }
}

function listOf<T>(file: string | undefined, key: string): T[] {
  if (!file || !existsSync(file)) return [];
  const docs = readLooseJson(file);
  return docs.flatMap((doc) => {
    const inner = (doc as Record<string, unknown> | null)?.[key];
    return Array.isArray(inner) ? (inner as T[]) : [doc as T];
  });
}

function flags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!name.startsWith("--") || value === undefined) throw new Error(`expected --name value pairs, got '${text(name, 40)}'`);
    out[name.slice(2)] = value;
  }
  return out;
}

function need(f: Record<string, string>, name: string): string {
  const value = f[name];
  if (value === undefined || value === "") throw new Error(`--${name} is required`);
  return value;
}

function candidateOf(f: Record<string, string>): string {
  const candidate = need(f, "candidate").replace(/^v/, "");
  if (!CANDIDATE.test(candidate)) throw new Error(`--candidate must look like 16.3.0-rc.1, got '${text(candidate, 40)}'`);
  return candidate;
}

/** Runs the command and returns what goes to stdout. */
export function run(argv: string[]): string {
  const [command, ...rest] = argv;
  const f = flags(rest);
  if (command === "find-run") {
    const match = matchRun(listOf<WorkflowRun>(need(f, "runs"), "workflow_runs"), candidateOf(f), need(f, "dispatched-at"));
    return `${JSON.stringify({ status: match.status, how: match.how ?? null, id: match.run?.id ?? null, detail: match.detail })}\n`;
  }
  if (command === "render") {
    const candidate = candidateOf(f);
    const runInfo = readLooseJson(need(f, "run"))[0] as WorkflowRun | undefined;
    if (!runInfo || !Number.isInteger(runInfo.id)) throw new Error("--run does not hold a workflow run");
    const report = f["report-dir"] ? findReport(f["report-dir"]) : undefined;
    const how = f.how === "time-window" || f.how === "run-name" ? f.how : undefined;
    // A match made by time alone must be confirmed by the report it produced.
    if (how === "time-window" && report && !reportNamesCandidate(report, candidate)) {
      throw new Error(`the run matched by time judged another candidate (its side b does not name ${candidate}); nothing is posted`);
    }
    const artifact = listOf<{ id?: number; name?: string; expired?: boolean }>(f.artifacts, "artifacts").find((a) => a.name === REPORT_ARTIFACT && a.expired !== true);
    const input: CommentInput = {
      candidate,
      production: f.production ? f.production.replace(/^v/, "") : undefined,
      runId: runInfo.id,
      artifactId: artifact?.id,
      report,
      jobs: listOf<JobInfo>(f.jobs, "jobs"),
      pending: f.state === "timeout",
      how,
      runConclusion: runInfo.conclusion ?? null
    };
    writeFileSync(need(f, "out"), `${renderComment(input, { maxHunks: f["max-hunks"] ? Number(f["max-hunks"]) : undefined })}\n`);
    const verdict = judge(report, input.pending);
    return `${JSON.stringify({ outcome: verdict.outcome, label: verdict.label, exitCode: verdict.exitCode ?? null })}\n`;
  }
  if (command === "pick-comment") {
    const id = pickComment(listOf<IssueComment>(need(f, "comments"), "comments"));
    return id === undefined ? "" : `${id}\n`;
  }
  throw new Error("usage: release-report-comment.ts find-run|render|pick-comment --name value ...");
}

function main(): void {
  try {
    process.stdout.write(run(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`FAIL: ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
