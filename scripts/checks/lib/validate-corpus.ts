import { createHash } from "node:crypto";
import { applyFixes, joinPath, planFixes, validate, type FileSystemPort, type Finding, type Severity } from "../../../packages/jsr/course-rules/src/mod.ts";

/**
 * The pure half of the validate corpus check (scripts/checks/validate-corpus.ts, Rules 0758-0760): what
 * `tutors validate` reports on a real course, how that compares with the committed baseline, whether it
 * agrees with the generator, and whether --fix settles. No network and no git here, so the steps in
 * tests/bdd drive every judgement over in-memory and temporary courses.
 */

/** One finding as the baseline keeps it: what a lecturer reads, without the fix plan. */
export interface BaselineFinding {
  rule: string;
  severity: Severity;
  path: string;
  message: string;
}

export interface BaselineCourse {
  commit: string;
  findings: BaselineFinding[];
}

export interface Baseline {
  courses: Record<string, BaselineCourse>;
}

export const toBaseline = (findings: readonly Finding[]): BaselineFinding[] => findings.map(({ rule, severity, path, message }) => ({ rule, severity, path, message }));

export interface CourseDiff {
  course: string;
  /** Set when the baseline was recorded at another commit (or not at all): the findings can't be compared. */
  stale?: string;
  added: BaselineFinding[];
  removed: BaselineFinding[];
}

const key = (f: BaselineFinding) => JSON.stringify([f.rule, f.severity, f.path, f.message]);

/** What changed on one course since the baseline: a finding is the same only when rule, severity, path and message all are. */
export function diffCourse(course: string, commit: string, baseline: BaselineCourse | undefined, current: readonly BaselineFinding[]): CourseDiff {
  if (!baseline) return { course, stale: "the baseline has no entry for this course", added: [...current], removed: [] };
  if (baseline.commit !== commit)
    return {
      course,
      stale: `the baseline was recorded at ${baseline.commit.slice(0, 12)}, the corpus pins ${commit.slice(0, 12)}`,
      added: [...current],
      removed: [...baseline.findings]
    };
  const before = new Set(baseline.findings.map(key));
  const now = new Set(current.map(key));
  return { course, added: current.filter((f) => !before.has(key(f))), removed: baseline.findings.filter((f) => !now.has(key(f))) };
}

export const differs = (diff: CourseDiff): boolean => diff.stale !== undefined || diff.added.length > 0 || diff.removed.length > 0;

/** The new errors: each would stop a Netlify deploy whose build runs tutors validate first (Rule 0744). */
export const newErrors = (diff: CourseDiff): BaselineFinding[] => (diff.stale ? [] : diff.added.filter((f) => f.severity === "error"));

/** V002 and V018 must name exactly the folders gen drops (the fixture test holds the same on fixtures). */
export interface GenAgreement {
  course: string;
  /** Folders gen drops that validate is silent about: a lecturer loses them without a word. */
  onlyGen: string[];
  /** Folders validate says won't appear, which gen in fact builds: a false alarm. */
  onlyValidate: string[];
}

export function genAgreement(course: string, findings: readonly Finding[], dropped: readonly string[]): GenAgreement {
  const named = new Set(findings.filter((f) => f.rule === "V002" || f.rule === "V018").map((f) => f.path));
  const gone = new Set(dropped);
  return { course, onlyGen: [...gone].filter((p) => !named.has(p)).sort(), onlyValidate: [...named].filter((p) => !gone.has(p)).sort() };
}

export const agrees = (a: GenAgreement): boolean => a.onlyGen.length === 0 && a.onlyValidate.length === 0;

/** A file's content, as a digest; files bigger than this are compared by size only, so a corpus of slide decks stays quick. */
const DIGEST_LIMIT = 1024 * 1024;

async function contents(fs: FileSystemPort): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await walkEntries(fs, "")) {
    if (entry.size !== undefined && entry.size > DIGEST_LIMIT) out.push(`size:${entry.size}`);
    else
      out.push(
        `sha256:${createHash("sha256")
          .update(await fs.read(entry.path))
          .digest("hex")}`
      );
  }
  return out.sort();
}

async function walkEntries(fs: FileSystemPort, dir: string): Promise<{ path: string; size?: number }[]> {
  const out: { path: string; size?: number }[] = [];
  for (const entry of await fs.list(dir)) {
    const path = joinPath(dir, entry.name);
    if (entry.kind === "dir") out.push(...(await walkEntries(fs, path)));
    else out.push({ path, size: entry.size });
  }
  return out;
}

const errorCounts = (findings: readonly Finding[]) => {
  const counts = new Map<string, number>();
  for (const f of findings) if (f.severity === "error") counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1);
  return counts;
};

/**
 * Applies --fix twice to a course (it changes the course: give it a copy) and lists what breaks the promise
 * of Rules 0716 and 0760: the second pass must apply nothing, every file's content must still be in the course, and no
 * rule may report more errors than before. An empty list means --fix settles.
 */
export async function fixSettles(fs: FileSystemPort, check: (fs: FileSystemPort) => Promise<Finding[]> = validate): Promise<string[]> {
  const problems: string[] = [];
  const before = await check(fs);
  const kept = await contents(fs);
  await applyFixes(fs, "", planFixes(before));
  const after = await check(fs);
  const second = await applyFixes(fs, "", planFixes(after));
  if (second.applied.length > 0) {
    problems.push(`a second --fix still changed ${second.applied.map((op) => (op.op === "move" ? `${op.from} -> ${op.to}` : op.path)).join(", ")}`);
  }
  const now = await contents(fs);
  const remaining = [...now];
  for (const item of kept) {
    const at = remaining.indexOf(item);
    if (at === -1) problems.push(`a file's content (${item}) is gone after --fix`);
    else remaining.splice(at, 1);
  }
  const was = errorCounts(before);
  for (const [rule, count] of errorCounts(after)) {
    if (count > (was.get(rule) ?? 0)) problems.push(`--fix raised ${rule} errors from ${was.get(rule) ?? 0} to ${count}`);
  }
  return problems;
}

const line = (f: BaselineFinding) => `${f.severity} ${f.rule} ${f.path || "(course)"}: ${f.message}`;

/** The check's report, for the job log and the step summary. */
export function summary(diffs: readonly CourseDiff[], agreements: readonly GenAgreement[], fixes: Readonly<Record<string, string[]>>): string {
  const out: string[] = [];
  const changed = diffs.filter(differs);
  out.push(`tutors validate on ${diffs.length} real courses: ${changed.length === 0 ? "every finding matches the baseline" : `${changed.length} differ from the baseline`}.`);
  for (const diff of changed) {
    out.push("", `${diff.course}:`);
    if (diff.stale) out.push(`  ${diff.stale}`);
    for (const f of diff.added) out.push(`  + ${line(f)}${f.severity === "error" && !diff.stale ? "  <- a new error: a deploy that runs tutors validate stops here" : ""}`);
    for (const f of diff.removed) out.push(`  - ${line(f)}`);
  }
  const stopped = changed.filter((d) => newErrors(d).length > 0).map((d) => d.course);
  if (stopped.length > 0) out.push("", `New errors on ${stopped.join(", ")}: each would stop that course's Netlify deploy (Rule 0744), so say why in the pull request.`);
  if (changed.length > 0) out.push("", "If the change is intended: pnpm check:validate-corpus --update, and commit tests/validate-corpus/baseline.json.");
  for (const a of agreements.filter((x) => !agrees(x))) {
    out.push("", `${a.course}: validate and the generator disagree about which folders are left out.`);
    for (const p of a.onlyGen) out.push(`  gen drops ${p}, validate says nothing`);
    for (const p of a.onlyValidate) out.push(`  validate says ${p} won't appear, gen builds it`);
  }
  for (const [course, problems] of Object.entries(fixes)) {
    if (problems.length === 0) continue;
    out.push("", `${course}: --fix does not settle.`);
    for (const p of problems) out.push(`  ${p}`);
  }
  return out.join("\n") + "\n";
}

/** Exit 1 when any course differs from its baseline, disagrees with gen, or --fix does not settle. */
export const passes = (diffs: readonly CourseDiff[], agreements: readonly GenAgreement[], fixes: Readonly<Record<string, string[]>>): boolean =>
  !diffs.some(differs) && agreements.every(agrees) && Object.values(fixes).every((p) => p.length === 0);
