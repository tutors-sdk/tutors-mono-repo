/**
 * EARS dashboard: one self-contained HTML page that shows every feature file under
 * tests/bdd/features, its Rules in their EARS pattern, the scenarios that prove each
 * Rule, what proves the scenarios (a steps file or a Playwright test) and what the EARS
 * audit says about it. It also teaches the format: the anatomy of a Rule, the five
 * patterns, each with a real Rule from this repository, and the audit's checks.
 *
 *   pnpm ears:dashboard                                  # reports/ears-dashboard/index.html
 *   pnpm ears:dashboard --since origin/main              # also marks Rules added or changed since a ref
 *   pnpm ears:dashboard --out <file> --json <file>       # where to write the page, and its data as JSON
 *
 * Nothing here is a second parser or a second audit: the page is built from
 * scripts/checks/ears-audit.ts and scripts/checks/lib, so it says what CI says.
 * The page needs no server and loads nothing from the network; open the file.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditFiles,
  BASELINE_FILE,
  classifyTitle,
  evaluate,
  FEATURES_DIR,
  findFeatureFiles,
  indexUiTests,
  loadConfig,
  nextRuleId,
  readRetired,
  STEPS_DIR,
  UI_TAG,
  type AuditConfig,
  type EarsPattern,
  type ViolationCode
} from "./checks/ears-audit.ts";
import { parseGherkin, ruleId } from "./checks/lib/gherkin-rules.ts";
import { REPO_ROOT, readBaseline, readText, toPosix, walk } from "./checks/lib/repo.ts";
import { diffRules, gitIn, rulesAtRef, rulesInWorkingTree, type GitRunner } from "./checks/lib/rules-index.ts";

export const DEFAULT_OUT = "reports/ears-dashboard/index.html";
export const DEFAULT_REPO_URL = "https://github.com/tutors-sdk/tutors-mono-repo";

export const PATTERNS: readonly EarsPattern[] = ["ubiquitous", "event-driven", "state-driven", "unwanted", "optional"];

/** How each EARS pattern reads, as a requirement and as a Rule title. Wording follows guides/testing/EARS-METHODOLOGY.md. */
export const PATTERN_GUIDE: Record<EarsPattern, { ears: string; rule: string; use: string }> = {
  ubiquitous: {
    ears: "The <system> shall <response>.",
    rule: "The reader shall <observable response>.",
    use: "Always-on behaviour with no trigger: layout invariants, what a page always shows."
  },
  "event-driven": {
    ears: "When <trigger>, the <system> shall <response>.",
    rule: "When a student <does something>, the reader shall <observable response>.",
    use: "A user action or system event: clicks, submissions, navigation, a realtime message."
  },
  "state-driven": {
    ears: "While <state>, the <system> shall <response>.",
    rule: "While <state holds>, the reader shall <observable response>.",
    use: "Behaviour that holds as long as a state does. Needs an @active and an @inactive scenario."
  },
  unwanted: {
    ears: "If <unwanted condition>, then the <system> shall <response>.",
    rule: "If <something goes wrong>, then the reader shall <observable response>.",
    use: "Failures and bad input: network errors, expired sessions, missing data."
  },
  optional: {
    ears: "Where <feature is included>, the <system> shall <response>.",
    rule: "Where <a feature or option is enabled>, the reader shall <observable response>.",
    use: "Configurable features and course options. Needs an @active and an @inactive scenario."
  }
};

/** What each audit code means, for a reader who meets it on the dashboard. Mirrors the table in EARS-METHODOLOGY.md. */
export const CODE_HELP: Record<ViolationCode, string> = {
  "no-rule": "Scenarios sit outside any Rule. Put each under a Rule: whose title is the requirement it proves.",
  "rule-id": "The Rule has no @rule-NNNN tag, or a malformed or second one.",
  "rule-id-duplicate": "Another Rule uses the same id. Ids are unique across the repository.",
  "rule-id-retired": "The id is in tests/bdd/ears-retired-rule-ids.txt and is never reused.",
  "shall-count": 'The title does not contain exactly one "shall".',
  "obligation-keyword": 'The title says should, must, will, would, may, might or could instead of "shall".',
  "vague-language": "The title uses a word from the vague list; say what is observable.",
  "system-name": 'The words before "shall" are not one of the system names.',
  "ears-form": 'A When, While or Where title has no comma before the system, or an If title has no ", then".',
  "ears-tag-missing": "The Rule has no @ears-* tag.",
  "ears-tag-mismatch": "The @ears-* tag is not the one the title's first word implies.",
  "no-scenarios": "No scenario sits beneath the Rule.",
  "dual-scenarios": "A state-driven or optional Rule lacks a scenario tagged @active and one tagged @inactive.",
  "unbound-feature": "No steps file under tests/bdd/steps loads the feature.",
  "unbound-rule": "No steps file binds the Rule title with Rule(\"<title>\", ...).",
  "rule-not-run": "The binding is Rule.skip/Rule.only, or the proving Playwright test is skipped.",
  "unproved-scenario": "A @ui scenario has no Playwright test with its title tagged with the Rule id.",
  "orphan-ui-test": "A Playwright test cites a Rule id whose @ui Rule has no scenario with that title."
};

export type RuleStatus = "clean" | "baselined" | "failing";

export interface DashboardViolation {
  code: ViolationCode;
  line: number;
  message: string;
  /** True when tests/bdd/ears-audit-baseline.txt allows it, so CI does not fail on it. */
  baselined: boolean;
}

export interface DashboardProof {
  kind: "steps" | "playwright";
  file: string;
  line: number;
  /** The scenario a Playwright test proves; absent for a steps file, which binds the whole Rule. */
  scenario?: string;
}

export interface DashboardScenario {
  title: string;
  line: number;
  tags: string[];
}

export interface DashboardRule {
  /** Four digits, or undefined when the Rule has no well-formed id (an audit finding). */
  id: string | undefined;
  title: string;
  line: number;
  /** The pattern the title's wording has, which the @ears-* tag must match. */
  pattern: EarsPattern;
  tags: string[];
  scenarios: DashboardScenario[];
  /** The Rule block as written: tags, title, description and scenarios. */
  source: string;
  sourceStart: number;
  proofs: DashboardProof[];
  violations: DashboardViolation[];
  status: RuleStatus;
  /** Set when the page was built with --since. */
  change?: "added" | "changed";
}

export interface DashboardFeature {
  file: string;
  /** The directory under tests/bdd/features: student, instructor, ui, ... */
  area: string;
  name: string;
  tags: string[];
  description: string;
  /** Rules proved by Playwright rather than by a steps file. */
  ui: boolean;
  /** Steps files that load this feature. */
  stepsFiles: string[];
  rules: DashboardRule[];
  /** Scenarios not yet under a Rule (the audit baseline lists these as no-rule). */
  looseScenarios: DashboardScenario[];
  /** Violations about the file rather than one Rule: no-rule, unbound-feature. */
  violations: DashboardViolation[];
  source: string;
}

export interface DashboardData {
  generatedAt: string;
  repoUrl: string;
  /** Commit or branch the source links point at. */
  ref: string;
  since?: string;
  nextId: string;
  retiredIds: number;
  systems: string[];
  wrongObligations: string[];
  vagueTerms: string[];
  features: DashboardFeature[];
  /** Rules present at --since and gone now. */
  removed: { id: string; title: string; file: string }[];
  /** Violations outside the feature files, such as orphan Playwright tests. */
  otherViolations: (DashboardViolation & { file: string })[];
  /** One clean Rule per pattern, chosen from the features, for the format guide. */
  examples: Partial<Record<EarsPattern, { file: string; ruleIndex: number; featureIndex: number }>>;
}

export interface BuildOptions {
  /** A git ref: Rules added or changed since it are marked, removed ones listed. */
  since?: string;
  git?: GitRunner;
  repoUrl?: string;
  ref?: string;
  /** Fixed for tests; defaults to now. */
  now?: Date;
  config?: AuditConfig;
}

/** Prose between a `Feature:` or `Rule:` line and the first tag, comment, scenario or Rule below it. */
export function descriptionAfter(lines: string[], line: number): string {
  const out: string[] = [];
  for (let i = line; i < lines.length; i++) {
    const text = lines[i].trim();
    if (/^(@|#|Rule:|Background:|Scenario|Example)/.test(text)) break;
    out.push(text);
  }
  return out.join("\n").trim();
}

/** Steps files under tests/bdd/steps keyed by the feature path each passes to `loadFeature`, with the text of each. */
export function stepsFilesByFeature(root: string): Map<string, { file: string; text: string }[]> {
  const byFeature = new Map<string, { file: string; text: string }[]>();
  for (const path of walk(join(root, STEPS_DIR), (name) => /\.steps\.(ts|js|mjs)$/.test(name)).sort()) {
    const text = readText(path);
    for (const match of text.matchAll(/\bloadFeature\(\s*["'`]([^"'`$]+\.feature)["'`]/g)) {
      const feature = match[1].replace(/^\.\//, "");
      byFeature.set(feature, [...(byFeature.get(feature) ?? []), { file: toPosix(path, root), text }]);
    }
  }
  return byFeature;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** Everything the page shows, read from the repository at `root`. */
export function buildDashboard(root: string = REPO_ROOT, options: BuildOptions = {}): DashboardData {
  const config = options.config ?? loadConfig(root);
  const files = findFeatureFiles(root);
  const violations = auditFiles(files, root, { config });
  const baselinePath = join(root, BASELINE_FILE);
  const report = evaluate(violations, existsSync(baselinePath) ? readBaseline(baselinePath) : undefined);
  const baselined = new Set(report.baselined);
  const toDashboard = (v: (typeof violations)[number]): DashboardViolation => ({ code: v.code, line: v.line, message: v.message, baselined: baselined.has(v) });

  const steps = stepsFilesByFeature(root);
  const uiTests = indexUiTests(root);

  let change = new Map<string, "added" | "changed">();
  let removed: DashboardData["removed"] = [];
  if (options.since) {
    const diff = diffRules(rulesAtRef(options.since, options.git ?? gitIn(root)), rulesInWorkingTree(root));
    change = new Map([...diff.added.map((r) => [r.id, "added"] as const), ...diff.changed.map((r) => [r.id, "changed"] as const)]);
    removed = diff.removed.map((r) => ({ id: r.id, title: r.title, file: r.file }));
  }

  const features: DashboardFeature[] = files.map((path) => {
    const file = toPosix(path, root);
    const text = readText(path);
    const lines = text.split(/\r?\n/);
    const doc = parseGherkin(text);
    const ui = doc.featureTags.includes(UI_TAG);
    const featureSteps = steps.get(file) ?? [];
    const mine = violations.filter((v) => v.file === file);

    const rules: DashboardRule[] = doc.rules.map((rule) => {
      const id = ruleId(rule);
      const subject = id ? `@rule-${id}` : rule.title;
      const ruleViolations = mine.filter((v) => v.subject === subject && v.line >= rule.startLine && v.line <= rule.endLine).map(toDashboard);
      const proofs: DashboardProof[] = [];
      if (ui) {
        for (const scenario of rule.scenarios) {
          const test = uiTests.find((t) => t.title === scenario.title && t.tags.includes(subject));
          if (test) proofs.push({ kind: "playwright", file: test.file, line: test.line, scenario: scenario.title });
        }
      } else {
        for (const { file: stepsFile, text: stepsText } of featureSteps) {
          const at = stepsText.search(new RegExp(`\\bRule(?:\\.skip|\\.only)?\\(\\s*["'\`]${rule.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/["']/g, "\\\\?$&")}`));
          if (at >= 0) proofs.push({ kind: "steps", file: stepsFile, line: lineOf(stepsText, at) });
        }
      }
      let end = rule.endLine;
      while (end > rule.line && /^\s*(#.*)?$/.test(lines[end - 1])) end--;
      const failing = ruleViolations.some((v) => !v.baselined);
      return {
        id,
        title: rule.title,
        line: rule.line,
        pattern: classifyTitle(rule.title),
        tags: rule.tags,
        scenarios: rule.scenarios.map((s) => ({ title: s.title, line: s.line, tags: s.tags })),
        source: lines.slice(rule.startLine - 1, end).join("\n"),
        sourceStart: rule.startLine,
        proofs,
        violations: ruleViolations,
        status: failing ? "failing" : ruleViolations.length > 0 ? "baselined" : "clean",
        ...(id && change.has(id) ? { change: change.get(id) } : {})
      };
    });

    const ruleSubjects = new Set(rules.flatMap((r) => [r.id ? `@rule-${r.id}` : r.title]));
    return {
      file,
      area: file.slice(FEATURES_DIR.length + 1).split("/").slice(0, -1).join("/") || "(top level)",
      name: doc.featureName ?? file,
      tags: doc.featureTags,
      description: doc.featureLine ? descriptionAfter(lines, doc.featureLine) : "",
      ui,
      stepsFiles: featureSteps.map((s) => s.file),
      rules,
      looseScenarios: doc.looseScenarios.map((s) => ({ title: s.title, line: s.line, tags: s.tags })),
      violations: mine.filter((v) => !ruleSubjects.has(v.subject) || v.subject === "").map(toDashboard),
      source: text
    };
  });

  const examples: DashboardData["examples"] = {};
  for (const pattern of PATTERNS) {
    let best: { file: string; ruleIndex: number; featureIndex: number; size: number } | undefined;
    features.forEach((feature, featureIndex) =>
      feature.rules.forEach((rule, ruleIndex) => {
        if (rule.pattern !== pattern || rule.status !== "clean" || rule.scenarios.length === 0) return;
        const size = rule.source.length;
        if (!best || size < best.size) best = { file: feature.file, ruleIndex, featureIndex, size };
      })
    );
    if (best) examples[pattern] = { file: best.file, ruleIndex: best.ruleIndex, featureIndex: best.featureIndex };
  }

  const featurePaths = new Set(features.map((f) => f.file));
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    repoUrl: options.repoUrl ?? DEFAULT_REPO_URL,
    ref: options.ref ?? currentRef(root),
    ...(options.since ? { since: options.since } : {}),
    nextId: nextRuleId(root),
    retiredIds: readRetired(root).size,
    systems: config.systems,
    wrongObligations: config.wrongObligations,
    vagueTerms: config.vagueTerms,
    features,
    removed,
    otherViolations: violations.filter((v) => !featurePaths.has(v.file)).map((v) => ({ ...toDashboard(v), file: v.file })),
    examples
  };
}

function currentRef(root: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "main";
  }
}

export interface DashboardTotals {
  features: number;
  rules: number;
  scenarios: number;
  looseScenarios: number;
  clean: number;
  baselined: number;
  failing: number;
  byPattern: Record<EarsPattern, number>;
}

export function totals(data: DashboardData): DashboardTotals {
  const rules = data.features.flatMap((f) => f.rules);
  const byPattern = Object.fromEntries(PATTERNS.map((p) => [p, rules.filter((r) => r.pattern === p).length])) as Record<EarsPattern, number>;
  return {
    features: data.features.length,
    rules: rules.length,
    scenarios: rules.reduce((n, r) => n + r.scenarios.length, 0) + data.features.reduce((n, f) => n + f.looseScenarios.length, 0),
    looseScenarios: data.features.reduce((n, f) => n + f.looseScenarios.length, 0),
    clean: rules.filter((r) => r.status === "clean").length,
    baselined: rules.filter((r) => r.status === "baselined").length,
    failing: rules.filter((r) => r.status === "failing").length,
    byPattern
  };
}

/** JSON for an inline <script>: `<` is escaped so no feature text can close the script element. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** Text safe inside a Markdown table cell: backslashes first, then the pipes that would split the cell. */
const tableCell = (text: string): string => text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");

/** A Markdown summary for the GitHub Actions job summary. */
export function renderSummary(data: DashboardData): string {
  const t = totals(data);
  const out = [
    "### EARS dashboard",
    "",
    `${t.features} feature files, ${t.rules} Rules, ${t.scenarios} scenarios. ${t.clean} Rules pass the audit, ${t.baselined} are allowed by the baseline, ${t.failing} fail. ${t.looseScenarios} scenarios still sit outside a Rule. Next free Rule id: ${data.nextId}.`,
    "",
    "Download the `ears-dashboard` artifact of this run and open `index.html` to browse every Rule, its scenarios and its proof."
  ];
  if (data.since) {
    const moved = data.features.flatMap((f) => f.rules.filter((r) => r.change).map((r) => ({ r, f })));
    out.push("", `#### Rules changed since \`${data.since}\``, "");
    if (moved.length === 0 && data.removed.length === 0) out.push("No Rule was added, changed or removed.");
    else {
      out.push("| Rule | Change | Pattern | Audit | Title |", "|---|---|---|---|---|");
      for (const { r, f } of moved) out.push(`| [${r.id}](${data.repoUrl}/blob/${data.ref}/${f.file}#L${r.line}) | ${r.change} | ${r.pattern} | ${r.status} | ${tableCell(r.title)} |`);
      for (const r of data.removed) out.push(`| ${r.id} | removed | | | ${tableCell(r.title)} |`);
    }
  }
  return `${out.join("\n")}\n`;
}

export function renderDashboard(data: DashboardData): string {
  return PAGE.replace("/*__DATA__*/null", () => embedJson({ ...data, totals: totals(data), patternGuide: PATTERN_GUIDE, codeHelp: CODE_HELP, patterns: PATTERNS }));
}

/* ---------------- the page ---------------- */

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tutors EARS dashboard</title>
<style>
:root {
  --bg: #f6f6f3; --panel: #ffffff; --ink: #1d1d1b; --muted: #5d5d58; --line: #deddd6; --accent: #2f5bd3;
  --ok: #1f7a4d; --ok-bg: #e3f3ea; --warn: #8a5a00; --warn-bg: #fbf0d9; --bad: #b42318; --bad-bg: #fde8e6;
  --code-bg: #f1f0ec; --kw: #7a3eb1; --tag: #a15c00; --comment: #7c7c75; --str: #1f7a4d;
  --p-ubiquitous: #5b6b7a; --p-event-driven: #2f5bd3; --p-state-driven: #0f7c84; --p-unwanted: #b42318; --p-optional: #8a4fbf;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #161615; --panel: #1f1f1d; --ink: #ecebe6; --muted: #a8a79f; --line: #34342f; --accent: #8aa8ff;
    --ok: #6fd3a0; --ok-bg: #173527; --warn: #f0c26b; --warn-bg: #3a2e14; --bad: #ff8f84; --bad-bg: #3d1a17;
    --code-bg: #262623; --kw: #c79bf2; --tag: #f0b45c; --comment: #8d8c85; --str: #6fd3a0;
    --p-ubiquitous: #9aaabb; --p-event-driven: #8aa8ff; --p-state-driven: #5fd0d8; --p-unwanted: #ff8f84; --p-optional: #c79bf2;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
a { color: var(--accent); }
code, pre, .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 13px; }
header { padding: 24px 16px 0; max-width: 1180px; margin: 0 auto; }
header h1 { margin: 0 0 4px; font-size: 24px; }
header p { margin: 0; color: var(--muted); }
nav { display: flex; gap: 4px; margin-top: 18px; border-bottom: 1px solid var(--line); overflow-x: auto; }
nav button { background: none; border: 0; border-bottom: 3px solid transparent; padding: 10px 14px; font: inherit; color: var(--muted); cursor: pointer; white-space: nowrap; }
nav button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
main { max-width: 1180px; margin: 0 auto; padding: 20px 16px 64px; }
section[hidden] { display: none; }
h2 { font-size: 19px; margin: 28px 0 10px; }
h2:first-child { margin-top: 4px; }
h3 { font-size: 16px; margin: 0 0 6px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
.tile .n { font-size: 28px; font-weight: 700; line-height: 1.1; }
.tile .l { color: var(--muted); font-size: 13px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
.card > p:first-child { margin-top: 0; }
.card > p:last-child { margin-bottom: 0; }
.bars { display: grid; gap: 8px; }
.bar { display: grid; grid-template-columns: 120px 1fr 44px; align-items: center; gap: 10px; }
.bar .track { background: var(--code-bg); border-radius: 4px; height: 14px; overflow: hidden; }
.bar .fill { height: 100%; border-radius: 4px; }
.bar .v { text-align: right; font-variant-numeric: tabular-nums; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 13px; color: var(--muted); font-weight: 600; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.scroll { overflow-x: auto; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.pill.clean { background: var(--ok-bg); color: var(--ok); }
.pill.baselined { background: var(--warn-bg); color: var(--warn); }
.pill.failing { background: var(--bad-bg); color: var(--bad); }
.pill.change { background: var(--code-bg); color: var(--accent); border: 1px solid var(--accent); }
.pattern { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; color: var(--panel); white-space: nowrap; }
.rid { font-weight: 700; font-variant-numeric: tabular-nums; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; align-items: center; }
.controls input[type=search] { flex: 1 1 260px; min-width: 0; }
.controls input, .controls select, .controls button { font: inherit; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--ink); }
.controls label { display: inline-flex; gap: 6px; align-items: center; color: var(--muted); }
.count { color: var(--muted); font-size: 13px; margin-bottom: 8px; }
details.feature { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; margin-bottom: 10px; }
details.feature > summary { padding: 12px 14px; cursor: pointer; list-style: none; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
details.feature > summary::-webkit-details-marker { display: none; }
details.feature > summary::before { content: "▸"; color: var(--muted); }
details.feature[open] > summary::before { content: "▾"; }
.fname { font-weight: 650; }
.fpath { color: var(--muted); font-size: 12px; }
.fbody { padding: 0 14px 14px; }
.desc { white-space: pre-wrap; color: var(--muted); margin: 0 0 10px; }
.meta { font-size: 13px; color: var(--muted); margin: 0 0 10px; }
details.rule { border-top: 1px solid var(--line); }
details.rule > summary { padding: 10px 2px; cursor: pointer; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; list-style: none; }
details.rule > summary::-webkit-details-marker { display: none; }
.rhead { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.rtitle { grid-column: 1 / -1; }
.rbody { padding: 0 2px 12px; }
pre.src { background: var(--code-bg); border-radius: 8px; padding: 10px 0; overflow-x: auto; margin: 6px 0 10px; line-height: 1.5; }
pre.src .ln { display: inline-block; width: 46px; padding-right: 10px; text-align: right; color: var(--comment); user-select: none; }
pre.src .ln a { color: inherit; text-decoration: none; }
pre.src .row { display: block; padding-right: 12px; white-space: pre; }
.k { color: var(--kw); font-weight: 600; }
.t { color: var(--tag); }
.c { color: var(--comment); font-style: italic; }
.s { color: var(--str); }
ul.plain { margin: 4px 0 10px; padding-left: 20px; }
ul.plain li { margin: 2px 0; }
.v-bad { color: var(--bad); }
.v-warn { color: var(--warn); }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
.anatomy { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 760px) { .anatomy { grid-template-columns: 1fr; } .bar { grid-template-columns: 96px 1fr 36px; } }
.callout { border-left: 3px solid var(--accent); padding: 4px 12px; margin: 8px 0; }
ol.steps li { margin: 4px 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: var(--code-bg); border-radius: 6px; padding: 1px 8px; font-size: 13px; }
.empty { color: var(--muted); padding: 24px; text-align: center; }
mark { background: var(--warn-bg); color: inherit; }
</style>
</head>
<body>
<header>
  <h1>EARS requirements</h1>
  <p id="sub"></p>
  <nav role="tablist">
    <button role="tab" data-tab="overview" aria-selected="true">Overview</button>
    <button role="tab" data-tab="rules" aria-selected="false">Rules</button>
    <button role="tab" data-tab="guide" aria-selected="false">Write a Rule</button>
  </nav>
</header>
<main>
  <section id="overview"></section>
  <section id="rules" hidden>
    <div class="controls">
      <input type="search" id="q" placeholder="Search Rules, scenarios, ids, files" aria-label="Search">
      <select id="f-pattern" aria-label="Pattern"></select>
      <select id="f-area" aria-label="Area"></select>
      <select id="f-status" aria-label="Audit status">
        <option value="">Any audit status</option>
        <option value="clean">Passes the audit</option>
        <option value="baselined">Allowed by the baseline</option>
        <option value="failing">Fails the audit</option>
        <option value="loose">Has scenarios outside a Rule</option>
      </select>
      <label id="changed-wrap" hidden><input type="checkbox" id="f-changed"> <span id="changed-label">Changed only</span></label>
      <button id="expand">Expand all</button>
    </div>
    <div class="count" id="count"></div>
    <div id="list"></div>
  </section>
  <section id="guide" hidden></section>
</main>
<script>
const D = /*__DATA__*/null;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const blob = (file, line) => D.repoUrl + "/blob/" + D.ref + "/" + file + (line ? "#L" + line : "");
const link = (file, line, text) => '<a href="' + esc(blob(file, line)) + '" target="_blank" rel="noopener">' + esc(text || (file + (line ? ":" + line : ""))) + "</a>";
const pat = (p) => '<span class="pattern" style="background:var(--p-' + p + ')">' + p + "</span>";
const statusLabel = { clean: "passes audit", baselined: "baselined", failing: "fails audit" };
const pill = (s) => '<span class="pill ' + s + '">' + statusLabel[s] + "</span>";

function highlight(source, start, file) {
  let inDoc = false;
  return source.split("\n").map((raw, i) => {
    const n = start + i;
    let h = esc(raw);
    const t = raw.trim();
    if (/^("""|${"```"})/.test(t)) { inDoc = !inDoc; h = '<span class="s">' + h + "</span>"; }
    else if (inDoc) h = '<span class="s">' + h + "</span>";
    else if (t.startsWith("#")) h = '<span class="c">' + h + "</span>";
    else if (t.startsWith("@")) h = h.replace(/@[\w-]+/g, (m) => '<span class="t">' + m + "</span>");
    else h = h.replace(/^(\s*)(Feature|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Given|When|Then|And|But)(:?)/, (_, sp, kw, colon) => sp + '<span class="k">' + kw + colon + "</span>").replace(/&quot;[^&]*?&quot;/g, (m) => '<span class="s">' + m + "</span>");
    return '<span class="row"><span class="ln"><a href="' + esc(blob(file, n)) + '" target="_blank" rel="noopener">' + n + "</a></span>" + h + "</span>";
  }).join("");
}

/* ---------- overview ---------- */
function overview() {
  const t = D.totals;
  const tile = (n, l) => '<div class="tile"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>";
  const max = Math.max(1, ...D.patterns.map((p) => t.byPattern[p]));
  const areas = {};
  for (const f of D.features) {
    const a = (areas[f.area] ||= { features: 0, rules: 0, scenarios: 0, clean: 0, loose: 0, ui: f.ui });
    a.features++; a.rules += f.rules.length; a.clean += f.rules.filter((r) => r.status === "clean").length;
    a.scenarios += f.rules.reduce((n, r) => n + r.scenarios.length, 0) + f.looseScenarios.length; a.loose += f.looseScenarios.length;
  }
  const attention = [];
  for (const f of D.features) {
    for (const r of f.rules) if (r.status === "failing") attention.push("<li>" + '<a href="#rule-' + esc(r.id || "") + '" data-goto="' + esc(f.file) + '">' + esc(r.id ? "Rule " + r.id : r.title) + "</a> in " + esc(f.file) + ": " + esc(r.violations.filter((v) => !v.baselined).map((v) => v.code).join(", ")) + "</li>");
    if (f.looseScenarios.length) attention.push("<li>" + esc(f.file) + ": " + f.looseScenarios.length + " scenario(s) outside a Rule (migrating them shrinks the baseline)</li>");
  }
  let changed = "";
  if (D.since) {
    const rows = [];
    for (const f of D.features) for (const r of f.rules) if (r.change) rows.push("<tr><td class=\"rid\"><a href=\"#rule-" + esc(r.id) + "\">" + esc(r.id) + "</a></td><td>" + r.change + "</td><td>" + pat(r.pattern) + "</td><td>" + pill(r.status) + "</td><td>" + esc(r.title) + "</td></tr>");
    for (const r of D.removed) rows.push("<tr><td class=\"rid\">" + esc(r.id) + "</td><td>removed</td><td></td><td></td><td>" + esc(r.title) + "</td></tr>");
    changed = "<h2>Changed since " + esc(D.since) + "</h2>" + (rows.length ? '<div class="card scroll"><table><thead><tr><th>Rule</th><th>Change</th><th>Pattern</th><th>Audit</th><th>Title</th></tr></thead><tbody>' + rows.join("") + "</tbody></table></div>" : '<div class="card">No Rule was added, changed or removed.</div>');
  }
  $("#overview").innerHTML =
    '<div class="tiles">' + tile(t.features, "feature files") + tile(t.rules, "Rules (requirements)") + tile(t.scenarios, "scenarios") +
    tile(t.clean, "Rules passing the audit") + tile(t.baselined + t.failing, "Rules with findings") + tile(t.looseScenarios, "scenarios outside a Rule") + tile(D.nextId, "next free Rule id") + "</div>" +
    changed +
    "<h2>Rules by EARS pattern</h2><div class=\"card bars\">" + D.patterns.map((p) => '<div class="bar"><span>' + pat(p) + '</span><div class="track"><div class="fill" style="width:' + (100 * t.byPattern[p] / max) + "%;background:var(--p-" + p + ')"></div></div><span class="v">' + t.byPattern[p] + "</span></div>").join("") + "</div>" +
    "<h2>By area</h2><div class=\"card scroll\"><table><thead><tr><th>Area (tests/bdd/features/…)</th><th>Proved by</th><th class=\"num\">Features</th><th class=\"num\">Rules</th><th class=\"num\">Passing</th><th class=\"num\">Scenarios</th><th class=\"num\">Outside a Rule</th></tr></thead><tbody>" +
    Object.entries(areas).sort().map(([a, v]) => '<tr><td><a href="#" data-area="' + esc(a) + '">' + esc(a) + "</a></td><td>" + (v.ui ? "Playwright" : "vitest-cucumber") + '</td><td class="num">' + v.features + '</td><td class="num">' + v.rules + '</td><td class="num">' + v.clean + '</td><td class="num">' + v.scenarios + '</td><td class="num">' + v.loose + "</td></tr>").join("") + "</tbody></table></div>" +
    "<h2>Needs attention</h2>" + (attention.length ? '<div class="card"><ul class="plain">' + attention.join("") + "</ul></div>" : '<div class="card">Nothing: every Rule passes the audit and every scenario sits under a Rule.</div>') +
    (D.otherViolations.length ? "<h2>Other audit findings</h2><div class=\"card\"><ul class=\"plain\">" + D.otherViolations.map((v) => "<li>" + link(v.file, v.line) + " <b>" + esc(v.code) + "</b>: " + esc(v.message) + "</li>").join("") + "</ul></div>" : "");
  $("#overview").querySelectorAll("[data-area]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); $("#f-area").value = a.dataset.area; show("rules"); render(); }));
}

/* ---------- rules ---------- */
function ruleHtml(f, r) {
  const head = '<div class="rhead">' + (r.id ? '<span class="rid">' + esc(r.id) + "</span>" : '<span class="pill failing">no id</span>') + pat(r.pattern) + pill(r.status) +
    (r.change ? '<span class="pill change">' + r.change + "</span>" : "") + '<span class="meta" style="margin:0">' + r.scenarios.length + " scenario" + (r.scenarios.length === 1 ? "" : "s") + "</span></div>";
  const proofs = r.proofs.length ? '<ul class="plain">' + r.proofs.map((p) => "<li>" + (p.kind === "steps" ? "Bound in " : "Playwright proves “" + esc(p.scenario) + "” in ") + link(p.file, p.line) + "</li>").join("") + "</ul>" : '<p class="meta v-bad">Nothing binds this Rule yet.</p>';
  const vio = r.violations.length ? "<h3>Audit</h3><ul class=\"plain\">" + r.violations.map((v) => '<li class="' + (v.baselined ? "v-warn" : "v-bad") + '"><b>' + esc(v.code) + "</b>" + (v.baselined ? " (baselined)" : "") + ": " + esc(v.message) + "</li>").join("") + "</ul>" : "";
  return '<details class="rule" id="rule-' + esc(r.id || "") + '" data-search="' + esc((r.id || "") + " " + r.title + " " + r.scenarios.map((s) => s.title).join(" ") + " " + r.tags.join(" ")).toLowerCase() + '"><summary>' + head + '<span class="rtitle">' + esc(r.title) + "</span></summary>" +
    '<div class="rbody"><pre class="src">' + highlight(r.source, r.sourceStart, f.file) + "</pre><h3>Proof</h3>" + proofs + vio + "</div></details>";
}

function featureHtml(f, rules, open) {
  const loose = f.looseScenarios.length ? "<h3>Scenarios outside a Rule</h3><ul class=\"plain\">" + f.looseScenarios.map((s) => "<li>" + link(f.file, s.line, s.title) + "</li>").join("") + "</ul>" : "";
  const fv = f.violations.length ? '<ul class="plain">' + f.violations.map((v) => '<li class="' + (v.baselined ? "v-warn" : "v-bad") + '"><b>' + esc(v.code) + "</b>" + (v.baselined ? " (baselined)" : "") + ": " + esc(v.message) + "</li>").join("") + "</ul>" : "";
  const proof = f.ui ? "Scenarios proved by Playwright tests in apps/&lt;app&gt;/tests/e2e" : f.stepsFiles.length ? "Steps: " + f.stepsFiles.map((s) => link(s)).join(", ") : '<span class="v-bad">No steps file loads this feature</span>';
  return '<details class="feature"' + (open ? " open" : "") + ' data-file="' + esc(f.file) + '"><summary><span class="fname">' + esc(f.name) + '</span><span class="fpath">' + esc(f.file) + "</span>" +
    '<span class="meta" style="margin:0">' + f.rules.length + (f.rules.length === 1 ? " Rule" : " Rules") + (f.looseScenarios.length ? ", " + f.looseScenarios.length + " outside a Rule" : "") + "</span></summary>" +
    '<div class="fbody">' + (f.description ? '<p class="desc">' + esc(f.description) + "</p>" : "") + '<p class="meta">' + f.tags.map((t) => '<span class="chip mono">' + esc(t) + "</span> ").join("") + proof + " · " + link(f.file, 0, "view file") + "</p>" + fv +
    rules.map((r) => ruleHtml(f, r)).join("") + loose + "</div></details>";
}

function render() {
  const q = $("#q").value.trim().toLowerCase(), p = $("#f-pattern").value, a = $("#f-area").value, s = $("#f-status").value, ch = $("#f-changed").checked;
  const filtering = q || p || s || ch;
  let nRules = 0, nFeatures = 0;
  const html = D.features.map((f) => {
    if (a && f.area !== a) return "";
    if (s === "loose" && !f.looseScenarios.length) return "";
    const rules = f.rules.filter((r) => (!p || r.pattern === p) && (!s || s === "loose" || r.status === s) && (!ch || r.change) &&
      (!q || ((r.id || "") + " " + r.title + " " + r.scenarios.map((x) => x.title).join(" ") + " " + f.file + " " + f.name).toLowerCase().includes(q)));
    const looseHit = s === "loose" || (!p && !s && !ch && (!q || (f.file + " " + f.name + " " + f.looseScenarios.map((x) => x.title).join(" ")).toLowerCase().includes(q)) && f.looseScenarios.length);
    if (!rules.length && !looseHit) return "";
    nRules += rules.length; nFeatures++;
    return featureHtml(f, rules, !!filtering);
  }).join("");
  $("#list").innerHTML = html || '<div class="empty">No Rule matches.</div>';
  $("#count").textContent = nRules + " Rule" + (nRules === 1 ? "" : "s") + " in " + nFeatures + " feature file" + (nFeatures === 1 ? "" : "s");
}

/* ---------- guide ---------- */
function guide() {
  const anatomy = [
    "  @rule-0031 @ears-state-driven",
    "  Rule: While the viewport is from 390 to 767 pixels wide, the reader shall show resource cards two to a row.",
    "",
    "    @active",
    "    Scenario: Phone viewport sets cards two to a row",
    "      Given the viewport is 390 pixels wide",
    "      When a student opens the course home and a topic",
    "      Then the first two cards share a row",
    "",
    "    @inactive",
    "    Scenario: Desktop viewport sets cards side by side",
    "      Given the viewport is 1440 pixels wide",
    "      When a student opens the course home and a topic",
    "      Then each card is narrower than 400 pixels"
  ].join("\n");
  const ex = (p) => {
    const e = D.examples[p];
    if (!e) return '<p class="meta">No Rule of this pattern passes the audit yet.</p>';
    const f = D.features[e.featureIndex], r = f.rules[e.ruleIndex];
    return '<p class="meta">From ' + link(f.file, r.line) + " (<a href=\"#rule-" + esc(r.id) + "\">Rule " + esc(r.id) + "</a>)</p><pre class=\"src\">" + highlight(r.source, r.sourceStart, f.file) + "</pre>";
  };
  $("#guide").innerHTML =
    "<h2>What a Rule is</h2><div class=\"card\"><p>Every behaviour of Tutors is written down as a <b>Rule</b> in a Gherkin feature file under <code>tests/bdd/features/&lt;area&gt;/</code>. " +
    "The Rule's title is one requirement in <a href=\"https://alistairmavin.com/ears/\" target=\"_blank\" rel=\"noopener\">EARS</a> form (Easy Approach to Requirements Syntax). The scenarios beneath it are the executable proof: " +
    "a steps file under <code>tests/bdd/steps/</code> runs them with vitest-cucumber, or, for an <code>@ui</code> feature, a Playwright test with the same title runs them in a browser. " +
    "The full method is in <a href=\"" + esc(D.repoUrl) + "/blob/main/guides/testing/EARS-METHODOLOGY.md\" target=\"_blank\" rel=\"noopener\">guides/testing/EARS-METHODOLOGY.md</a>.</p></div>" +
    "<h2>Anatomy of a Rule</h2><div class=\"card anatomy\"><pre class=\"src\">" + highlight(anatomy, 1, "tests/bdd/features/ui/resource-cards.feature").replace(/href="[^"]*"/g, 'href="#"') + "</pre><ol class=\"steps\">" +
    "<li><code>@rule-NNNN</code>: the Rule's permanent id. Take the next one with <code>pnpm test:ears:audit --next-id</code> (now <b>" + esc(D.nextId) + "</b>). Ids are never reused; a deleted Rule's id goes in <code>tests/bdd/ears-retired-rule-ids.txt</code> (" + D.retiredIds + " so far).</li>" +
    "<li><code>@ears-…</code>: the pattern, which must match the title's first word: When, While, If, Where, or none.</li>" +
    "<li><code>Rule:</code> one sentence with exactly one <b>shall</b>, and a system name right before it.</li>" +
    "<li><code>Scenario:</code> at least one. A state-driven or optional Rule needs one tagged <code>@active</code> and one tagged <code>@inactive</code>.</li>" +
    "<li>Steps use Gherkin's own keywords (Given, When, Then, And, But). Never start a step with While, Where or If: Gherkin drops such a line silently.</li></ol></div>" +
    "<h2>The five patterns</h2>" + D.patterns.map((p) => {
      const g = D.patternGuide[p];
      return '<div class="card"><h3>' + pat(p) + ' <code class="mono">@ears-' + p + "</code></h3><p>" + esc(g.use) + '</p><p class="callout mono">' + esc(g.ears) + "<br>" + esc(g.rule) + "</p>" + ex(p) + "</div>";
    }).join("") +
    "<h2>Words the audit checks</h2><div class=\"grid2\">" +
    '<div class="card"><h3>System names before “shall”</h3><div class="chips">' + D.systems.map((s) => '<span class="chip">' + esc(s) + "</span>").join("") + "</div><p class=\"meta\">“The system shall” is not a system name.</p></div>" +
    '<div class="card"><h3>Obligation words that are not “shall”</h3><div class="chips">' + D.wrongObligations.map((s) => '<span class="chip">' + esc(s) + "</span>").join("") + "</div></div>" +
    '<div class="card"><h3>Vague words</h3><div class="chips">' + D.vagueTerms.map((s) => '<span class="chip">' + esc(s) + "</span>").join("") + "</div><p class=\"meta\">Say what is observable instead.</p></div></div>" +
    "<h2>Audit findings</h2><div class=\"card scroll\"><table><thead><tr><th>Code</th><th>Raised when</th></tr></thead><tbody>" + Object.entries(D.codeHelp).map(([c, h]) => "<tr><td class=\"mono\">" + esc(c) + "</td><td>" + esc(h) + "</td></tr>").join("") + "</tbody></table>" +
    "<p class=\"meta\">Findings that predate the audit are listed in <code>tests/bdd/ears-audit-baseline.txt</code>; CI fails only on new ones, and the baseline can only shrink.</p></div>" +
    "<h2>Adding a Rule</h2><div class=\"card\"><ol class=\"steps\">" +
    "<li>Pick the area (student, instructor, developer, shared, ui, …) and the system name.</li>" +
    "<li>Choose the pattern and write the title with exactly one “shall”.</li>" +
    "<li>Run <code>pnpm test:ears:audit --next-id</code> and tag the Rule <code>@rule-NNNN @ears-&lt;pattern&gt;</code>.</li>" +
    "<li>Write the scenarios beneath it.</li>" +
    "<li>Bind it with <code>Rule(\"&lt;title&gt;\", ({ RuleScenario }) =&gt; …)</code> in the steps file that loads the feature, or write a Playwright test per scenario for a <code>@ui</code> feature; watch <code>pnpm test:bdd</code> fail.</li>" +
    "<li>Implement until <code>pnpm test:bdd</code> passes and <code>pnpm test:ears:audit</code> reports nothing new; rebuild this page with <code>pnpm ears:dashboard</code>.</li></ol></div>";
}

/* ---------- wiring ---------- */
function show(tab) {
  document.querySelectorAll("nav button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== tab));
}
function goToRule(id) {
  if (!id) return;
  $("#q").value = ""; $("#f-pattern").value = ""; $("#f-area").value = ""; $("#f-status").value = ""; $("#f-changed").checked = false;
  show("rules"); render();
  const el = document.getElementById("rule-" + id);
  if (el) { el.open = true; el.closest("details.feature").open = true; el.scrollIntoView({ block: "start" }); }
}

const t = D.totals;
$("#sub").innerHTML = t.rules + " Rules in " + t.features + " feature files · built " + esc(D.generatedAt.slice(0, 16).replace("T", " ")) + " UTC from " + '<a href="' + esc(D.repoUrl + "/tree/" + D.ref) + '" target="_blank" rel="noopener">' + esc(D.ref.slice(0, 12)) + "</a>" + (D.since ? " · changes since " + esc(D.since) : "");
$("#f-pattern").innerHTML = '<option value="">Any pattern</option>' + D.patterns.map((p) => '<option value="' + p + '">' + p + " (" + t.byPattern[p] + ")</option>").join("");
$("#f-area").innerHTML = '<option value="">Any area</option>' + [...new Set(D.features.map((f) => f.area))].sort().map((a) => '<option>' + esc(a) + "</option>").join("");
if (D.since) { $("#changed-wrap").hidden = false; $("#changed-label").textContent = "Changed since " + D.since; }
["#q", "#f-pattern", "#f-area", "#f-status", "#f-changed"].forEach((s) => $(s).addEventListener("input", render));
$("#expand").addEventListener("click", () => { const open = $("#expand").textContent === "Expand all"; document.querySelectorAll("#list details").forEach((d) => (d.open = open)); $("#expand").textContent = open ? "Collapse all" : "Expand all"; });
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
document.addEventListener("click", (e) => { const a = e.target.closest('a[href^="#rule-"]'); if (a) { e.preventDefault(); goToRule(a.getAttribute("href").slice(6)); history.replaceState(null, "", a.getAttribute("href")); } });
overview(); guide(); render();
if (location.hash.startsWith("#rule-")) goToRule(location.hash.slice(6));
window.addEventListener("hashchange", () => { if (location.hash.startsWith("#rule-")) goToRule(location.hash.slice(6)); });
</script>
</body>
</html>
`;

/* ---------------- CLI ---------------- */

interface Args {
  out: string;
  json?: string;
  summary?: string;
  since?: string;
  ref?: string;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "--out") args.out = value();
    else if (arg === "--json") args.json = value();
    else if (arg === "--summary") args.summary = value();
    else if (arg === "--since") args.since = value();
    else if (arg === "--ref") args.ref = value();
    else throw new Error(`unknown option ${arg}`);
  }
  return args;
}

function write(path: string, text: string, append = false): string {
  const full = isAbsolute(path) ? path : join(REPO_ROOT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, append ? { flag: "a" } : undefined);
  return full;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const data = buildDashboard(REPO_ROOT, { since: args.since, ref: args.ref });
  const page = write(args.out, renderDashboard(data));
  if (args.json) write(args.json, `${JSON.stringify(data, null, 2)}\n`);
  if (args.summary) write(args.summary, renderSummary(data), true);
  const t = totals(data);
  process.stdout.write(`EARS dashboard: ${t.features} feature files, ${t.rules} Rules (${t.clean} pass the audit), ${t.scenarios} scenarios -> ${page}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

