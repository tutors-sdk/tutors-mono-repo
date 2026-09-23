/**
 * EARS audit (issue #214): structural rules for the `Rule:` blocks in
 * tests/bdd/features. A Rule title is one EARS requirement; its scenarios are
 * the proof. Behaviour is checked by `pnpm test:bdd`; this checks the shape.
 *
 *   pnpm test:ears:audit                      # baselined: only new violations fail
 *   pnpm test:ears:audit --strict             # no baseline: every violation fails
 *   pnpm test:ears:audit --next-id            # print the next free Rule id
 *   pnpm test:ears:audit --update-baseline    # drop fixed entries from the baseline (never adds)
 *   pnpm test:ears:audit path/to/x.feature    # audit chosen files
 *
 * Step coverage is vitest-cucumber's own strictness: a Rule, scenario or step
 * that exists on one side only fails `pnpm test:bdd`. The audit adds the static
 * half it can see without running anything: a feature no steps file loads, and
 * a Rule title no steps file binds.
 *
 * A feature tagged `@ui` states behaviour that needs a browser. Its scenarios are
 * proved by Playwright tests under apps/<app>/tests/e2e instead of a steps file:
 * each scenario needs a test with the same title tagged with its Rule id
 * (`test("<scenario>", { tag: "@rule-0031" }, ...)`), and a test that cites a
 * Rule id must be one of that Rule's scenarios.
 *
 * Written in TypeScript so it runs where the other checks run (`tsx`, no new
 * toolchain) and shares the ratchet with them.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseGherkin, RULE_ID_TAG, ruleId, ruleIdTags, type GherkinDocument, type GherkinRule } from "./lib/gherkin-rules.ts";
import { ratchet, describeRatchet } from "./lib/ratchet.ts";
import { REPO_ROOT, readBaseline, readText, toPosix, walk } from "./lib/repo.ts";

export const FEATURES_DIR = "tests/bdd/features";
export const STEPS_DIR = "tests/bdd/steps";
export const BASELINE_FILE = "tests/bdd/ears-audit-baseline.txt";
export const RETIRED_FILE = "tests/bdd/ears-retired-rule-ids.txt";
export const CONFIG_FILE = "tests/bdd/ears-audit.config.json";
/** Feature tag for Rules proved by Playwright tests rather than vitest-cucumber steps. */
export const UI_TAG = "@ui";
/** Where those Playwright tests live: apps/<app>/tests/e2e. */
export const UI_TESTS_DIR = "apps";

export type EarsPattern = "ubiquitous" | "event-driven" | "state-driven" | "unwanted" | "optional";
const PATTERNS: readonly EarsPattern[] = ["ubiquitous", "event-driven", "state-driven", "unwanted", "optional"];

export interface AuditConfig {
  /** The names allowed in front of "shall". Scope table: guides/EARS-METHODOLOGY.md. */
  systems: string[];
  /** Obligation words other than "shall". */
  wrongObligations: string[];
  /** Words and phrases that make a requirement untestable. */
  vagueTerms: string[];
}

export const DEFAULT_CONFIG: AuditConfig = {
  systems: ["tutors", "the reader", "the catalogue", "the live dashboard", "the time dashboard"],
  wrongObligations: ["should", "must", "will", "would", "may", "might", "could"],
  vagueTerms: [
    "appropriate",
    "appropriately",
    "as needed",
    "as necessary",
    "adequate",
    "adequately",
    "and/or",
    "correctly",
    "easily",
    "easy",
    "efficient",
    "efficiently",
    "etc",
    "fast",
    "flexible",
    "handle",
    "handles",
    "handling",
    "if possible",
    "intuitive",
    "properly",
    "quickly",
    "reasonable",
    "robust",
    "seamless",
    "seamlessly",
    "several",
    "some",
    "sufficient",
    "user-friendly",
    "various"
  ]
};

/** Defaults, overridden field by field by tests/bdd/ears-audit.config.json when it exists. */
export function loadConfig(root: string = REPO_ROOT): AuditConfig {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...(JSON.parse(readText(file)) as Partial<AuditConfig>) };
}

export type ViolationCode =
  | "no-rule"
  | "rule-id"
  | "rule-id-duplicate"
  | "rule-id-retired"
  | "shall-count"
  | "obligation-keyword"
  | "vague-language"
  | "system-name"
  | "ears-form"
  | "ears-tag-missing"
  | "ears-tag-mismatch"
  | "no-scenarios"
  | "dual-scenarios"
  | "unbound-feature"
  | "unbound-rule"
  | "rule-not-run"
  | "unproved-scenario"
  | "orphan-ui-test";

export interface Violation {
  code: ViolationCode;
  /** Repo-relative, forward slashes. */
  file: string;
  line: number;
  /** Stable name of what is wrong, used in the baseline: a Rule id, or the Rule title when it has none. */
  subject: string;
  message: string;
}

/** The baseline line for a violation. It has no line number, so unrelated edits do not churn it. */
export function baselineKey(v: Pick<Violation, "code" | "file" | "subject">): string {
  return v.subject ? `${v.code}: ${v.file} :: ${v.subject}` : `${v.code}: ${v.file}`;
}

/** The EARS pattern a title's wording has. */
export function classifyTitle(title: string): EarsPattern {
  const first = title.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (first === "when") return "event-driven";
  if (first === "while") return "state-driven";
  if (first === "where") return "optional";
  if (first === "if") return "unwanted";
  return "ubiquitous";
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordPattern = (words: string[]) => words.length === 0 ? /(?!)/g : new RegExp(`(?<![\\w-])(${words.map(escapeRegExp).join("|")})(?![\\w-])`, "gi");

export interface RuleContext {
  file: string;
  config: AuditConfig;
  retired: ReadonlySet<string>;
}

/** Everything wrong with one Rule on its own; cross-Rule checks (unique ids) and binding live in `auditDocument`. */
export function auditRule(rule: GherkinRule, ctx: RuleContext): Violation[] {
  const { file, config } = ctx;
  const id = ruleId(rule);
  const subject = id ? `@rule-${id}` : rule.title;
  const out: Violation[] = [];
  const add = (code: ViolationCode, message: string, line = rule.line) => out.push({ code, file, line, subject, message });

  const idTags = ruleIdTags(rule);
  if (idTags.length === 0) add("rule-id", "Rule has no id. Add a tag above it: `pnpm test:ears:audit --next-id` prints the next free one.");
  else if (idTags.length > 1) add("rule-id", `Rule has ${idTags.length} id tags (${idTags.join(", ")}); it takes exactly one.`);
  else if (!RULE_ID_TAG.test(idTags[0])) add("rule-id", `Rule id \`${idTags[0]}\` is malformed; expected @rule- and four digits, e.g. @rule-0031.`);
  else if (ctx.retired.has(idTags[0].slice("@rule-".length))) add("rule-id-retired", `Rule id ${idTags[0]} is retired and is never reused.`);

  const title = rule.title;
  const shalls = title.match(/\bshall\b/gi)?.length ?? 0;
  if (shalls !== 1) add("shall-count", `Rule title has ${shalls} "shall"; a requirement has exactly one.`);

  const wrong = [...new Set([...title.matchAll(wordPattern(config.wrongObligations))].map((m) => m[1].toLowerCase()))];
  if (wrong.length > 0) add("obligation-keyword", `Rule title uses ${wrong.map((w) => `"${w}"`).join(", ")}; the obligation keyword is "shall".`);

  const vague = [...new Set([...title.matchAll(wordPattern(config.vagueTerms))].map((m) => m[1].toLowerCase()))];
  if (vague.length > 0) add("vague-language", `Rule title uses vague language (${vague.map((w) => `"${w}"`).join(", ")}); say what is observable.`);

  const systems = config.systems.map(escapeRegExp).join("|");
  const subjectOfShall = new RegExp(`(?<![\\w-])(${systems})\\s+shall\\b`, "i");
  if (shalls >= 1 && !subjectOfShall.test(title)) {
    add("system-name", `The word before "shall" must be a system name: ${config.systems.join(", ")}.`);
  }

  const pattern = classifyTitle(title);
  if (pattern === "unwanted" && !/^if\b[^]*,\s*then\b/i.test(title)) add("ears-form", 'An unwanted-behaviour Rule reads "If <condition>, then <system> shall ...".');
  else if (pattern !== "ubiquitous" && pattern !== "unwanted" && !/^\w+\b[^,]*,/.test(title)) {
    add("ears-form", `A ${pattern} Rule reads "${{ "event-driven": "When", "state-driven": "While", optional: "Where" }[pattern]} <clause>, <system> shall ...".`);
  }

  const earsTags = rule.tags.filter((t) => /^@ears-/i.test(t));
  const known = earsTags.filter((t) => (PATTERNS as readonly string[]).includes(t.slice("@ears-".length)));
  if (earsTags.length === 0) add("ears-tag-missing", `Rule has no @ears-* tag; its wording is ${pattern}, so it takes @ears-${pattern}.`);
  else if (earsTags.length > 1 || known.length !== 1 || known[0] !== `@ears-${pattern}`) {
    add("ears-tag-mismatch", `Rule tags ${earsTags.join(", ")} do not match its ${pattern} wording; it takes exactly @ears-${pattern}.`);
  }

  if (rule.scenarios.length === 0) {
    add("no-scenarios", "Rule has no scenario; a Rule without proof is a wish.");
  } else if (pattern === "state-driven" || pattern === "optional") {
    const tagged = (tag: string) => rule.scenarios.some((s) => s.tags.includes(tag));
    if (!tagged("@active") || !tagged("@inactive")) {
      const what = pattern === "state-driven" ? "the state holds and it does not" : "the feature is enabled and it is not";
      add("dual-scenarios", `A ${pattern} Rule needs one scenario tagged @active and one tagged @inactive: ${what}.`);
    }
  }
  return out;
}

export interface StepsIndex {
  /** Feature path (repo-relative) to the text of every steps file that loads it. */
  byFeature: Map<string, string[]>;
}

/** Which steps files load which feature, read from the literal path each passes to `loadFeature`. */
export function indexSteps(root: string = REPO_ROOT): StepsIndex {
  const byFeature = new Map<string, string[]>();
  for (const path of walk(join(root, STEPS_DIR), (name) => /\.steps\.(ts|js|mjs)$/.test(name))) {
    const text = readText(path);
    for (const match of text.matchAll(/\bloadFeature\(\s*["'`]([^"'`$]+\.feature)["'`]/g)) {
      const feature = match[1].replace(/^\.\//, "");
      byFeature.set(feature, [...(byFeature.get(feature) ?? []), text]);
    }
  }
  return { byFeature };
}

export interface UiTest {
  /** Repo-relative spec path. */
  file: string;
  line: number;
  title: string;
  tags: string[];
  /** `skip`, `fixme`, `fail` or `only` when the test is declared with one. */
  modifier: string | undefined;
}

/** Playwright tests that declare tags: `test("title", { tag: ... }, ...)` in apps/<app>/tests/e2e. */
export function indexUiTests(root: string = REPO_ROOT): UiTest[] {
  const tests: UiTest[] = [];
  const specs = walk(join(root, UI_TESTS_DIR), (name) => name.endsWith(".spec.ts")).filter((path) => /[\\/]tests[\\/]e2e[\\/]/.test(path));
  for (const path of specs) {
    const text = readText(path);
    for (const match of text.matchAll(/\btest(?:\.(skip|fixme|fail|only))?\(\s*(["'`])((?:\\.|(?!\2)[^\\])*)\2\s*,\s*\{\s*tag:\s*(\[[^\]]*\]|["'`][^"'`]*["'`])/g)) {
      tests.push({
        file: toPosix(path, root),
        line: text.slice(0, match.index).split("\n").length,
        title: match[3].replace(/\\(.)/g, "$1"),
        tags: match[4].match(/@[\w-]+/g) ?? [],
        modifier: match[1]
      });
    }
  }
  return tests;
}

const isUiFeature = (doc: GherkinDocument) => doc.featureTags.includes(UI_TAG);

export interface AuditOptions {
  config?: AuditConfig;
  retired?: ReadonlySet<string>;
  /** When absent, binding is not checked (used by unit tests on bare fixtures). */
  steps?: StepsIndex;
  /** Playwright tests that prove `@ui` features. When absent, their binding is not checked. */
  uiTests?: UiTest[];
}

/** Violations in one feature file, given its repo-relative path and text. */
export function auditDocument(file: string, doc: GherkinDocument, options: AuditOptions = {}): Violation[] {
  const config = options.config ?? DEFAULT_CONFIG;
  const retired = options.retired ?? new Set<string>();
  const out: Violation[] = [];

  if (doc.looseScenarios.length > 0) {
    out.push({
      code: "no-rule",
      file,
      line: doc.looseScenarios[0].line,
      subject: "",
      message: `${doc.looseScenarios.length} scenario(s) sit outside a Rule. Put each under a \`Rule:\` whose title is the EARS requirement it proves.`
    });
  }
  for (const rule of doc.rules) out.push(...auditRule(rule, { file, config, retired }));

  if (isUiFeature(doc)) {
    if (options.uiTests) out.push(...auditUiBinding(file, doc, options.uiTests));
  } else if (options.steps) {
    const stepsTexts = options.steps.byFeature.get(file);
    if (!stepsTexts) {
      out.push({ code: "unbound-feature", file, line: doc.featureLine || 1, subject: "", message: "No steps file under tests/bdd/steps loads this feature with loadFeature(\"<literal path>\")." });
    } else {
      for (const rule of doc.rules) {
        const id = ruleId(rule);
        const subject = id ? `@rule-${id}` : rule.title;
        const literal = new RegExp(`\\bRule(\\.skip|\\.only)?\\(\\s*(["'\`])${escapeRegExp(rule.title).replace(/["']/g, `\\\\?$&`)}\\2`);
        const bound = stepsTexts.map((text) => text.match(literal)).find(Boolean);
        if (!bound) out.push({ code: "unbound-rule", file, line: rule.line, subject, message: `No steps file binds this Rule: expected Rule("${rule.title}", ...) in the file that loads the feature.` });
        else if (bound[1]) out.push({ code: "rule-not-run", file, line: rule.line, subject, message: `Rule${bound[1]}(...) turns this Rule's scenarios off.` });
      }
    }
  }
  return out;
}

/** Each scenario of a `@ui` feature needs a Playwright test with its title, tagged with its Rule id, that runs. */
function auditUiBinding(file: string, doc: GherkinDocument, uiTests: UiTest[]): Violation[] {
  const out: Violation[] = [];
  for (const rule of doc.rules) {
    const id = ruleId(rule);
    if (!id) continue;
    const subject = `@rule-${id}`;
    for (const scenario of rule.scenarios) {
      const test = uiTests.find((t) => t.title === scenario.title && t.tags.includes(subject));
      if (!test) {
        out.push({ code: "unproved-scenario", file, line: scenario.line, subject, message: `No Playwright test proves "${scenario.title}": expected test("${scenario.title}", { tag: "${subject}" }, ...) under ${UI_TESTS_DIR}/<app>/tests/e2e.` });
      } else if (test.modifier === "skip" || test.modifier === "fixme") {
        out.push({ code: "rule-not-run", file, line: scenario.line, subject, message: `test.${test.modifier}(...) at ${test.file}:${test.line} turns this scenario off.` });
      }
    }
  }
  return out;
}

/** Playwright tests that cite a Rule id which is not a `@ui` Rule, or whose title is not one of that Rule's scenarios. */
export function orphanUiTests(docs: { file: string; doc: GherkinDocument }[], uiTests: UiTest[]): Violation[] {
  const scenarios = new Map<string, Set<string>>();
  for (const { doc } of docs.filter(({ doc }) => isUiFeature(doc))) {
    for (const rule of doc.rules) if (ruleId(rule)) scenarios.set(`@rule-${ruleId(rule)}`, new Set(rule.scenarios.map((s) => s.title)));
  }
  return uiTests.flatMap((test) =>
    test.tags
      .filter((tag) => RULE_ID_TAG.test(tag) && !scenarios.get(tag)?.has(test.title))
      .map((tag) => ({
        code: "orphan-ui-test" as const,
        file: test.file,
        line: test.line,
        subject: `${tag} ${test.title}`,
        message: scenarios.has(tag)
          ? `"${test.title}" is not a scenario of ${tag}; rename the test to the scenario it proves, or add the scenario to the Rule.`
          : `${tag} is not a Rule in a ${UI_TAG} feature under ${FEATURES_DIR}.`
      }))
  );
}

/** Duplicate ids across every audited file. Reported on every Rule that shares an id. */
export function duplicateIds(docs: { file: string; doc: GherkinDocument }[]): Violation[] {
  const seen = new Map<string, { file: string; line: number }[]>();
  for (const { file, doc } of docs) {
    for (const rule of doc.rules) {
      const tags = ruleIdTags(rule);
      if (tags.length === 1 && RULE_ID_TAG.test(tags[0])) seen.set(tags[0], [...(seen.get(tags[0]) ?? []), { file, line: rule.line }]);
    }
  }
  return [...seen.entries()]
    .filter(([, places]) => places.length > 1)
    .flatMap(([tag, places]) =>
      places.map((place) => ({
        code: "rule-id-duplicate" as const,
        file: place.file,
        line: place.line,
        subject: tag,
        message: `Rule id ${tag} is used ${places.length} times (${places.map((p) => `${p.file}:${p.line}`).join(", ")}); ids are unique across the repository.`
      }))
    );
}

export function findFeatureFiles(root: string = REPO_ROOT): string[] {
  return walk(join(root, FEATURES_DIR), (name) => name.endsWith(".feature")).sort();
}

export function readRetired(root: string = REPO_ROOT): Set<string> {
  const file = join(root, RETIRED_FILE);
  return new Set(existsSync(file) ? readBaseline(file) : []);
}

/** Audit feature files (absolute paths). Ids are read from every file under tests/bdd/features so a subset still sees the whole id space. */
export function auditFiles(files: string[], root: string = REPO_ROOT, options: AuditOptions = {}): Violation[] {
  const config = options.config ?? loadConfig(root);
  const retired = options.retired ?? readRetired(root);
  const steps = options.steps ?? indexSteps(root);
  const uiTests = options.uiTests ?? indexUiTests(root);
  const docs = files.map((path) => ({ file: toPosix(path, root), doc: parseGherkin(readText(path)) }));
  const violations = docs.flatMap(({ file, doc }) => auditDocument(file, doc, { config, retired, steps, uiTests }));
  // Citations are checked against every feature, so auditing a subset does not orphan the rest.
  const allDocs = findFeatureFiles(root).map((path) => ({ file: toPosix(path, root), doc: parseGherkin(readText(path)) }));
  return [...violations, ...duplicateIds(docs), ...orphanUiTests(allDocs, uiTests)].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
}

/** The next free Rule id: one more than the highest used or retired. */
export function nextRuleId(root: string = REPO_ROOT): string {
  const used = [...readRetired(root)];
  for (const path of findFeatureFiles(root)) {
    for (const rule of parseGherkin(readText(path)).rules) used.push(...ruleIdTags(rule).map((t) => t.match(RULE_ID_TAG)?.[1] ?? "0"));
  }
  const highest = Math.max(0, ...used.map((id) => Number(id)).filter(Number.isFinite));
  return String(highest + 1).padStart(4, "0");
}

/* ---------------- GitHub Actions annotations ---------------- */

const escapeData = (text: string) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProperty = (text: string) => escapeData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");

export function annotation(v: Violation, level: "error" | "warning" = "error"): string {
  return `::${level} file=${escapeProperty(v.file)},line=${v.line},title=${escapeProperty(`EARS ${v.code}`)}::${escapeData(v.message)}`;
}

/* ---------------- ratchet ---------------- */

export interface AuditReport {
  violations: Violation[];
  /** Violations not in the baseline: these fail the run. */
  added: Violation[];
  /** Baseline lines whose violation is gone: delete them. */
  stale: string[];
  /** Violations the baseline still allows. */
  baselined: Violation[];
}

export function evaluate(violations: Violation[], baseline: string[] | undefined): AuditReport {
  if (!baseline) return { violations, added: violations, stale: [], baselined: [] };
  const result = ratchet(violations.map(baselineKey), baseline);
  const added = new Set(result.added);
  return {
    violations,
    added: violations.filter((v) => added.has(baselineKey(v))),
    stale: result.stale,
    baselined: violations.filter((v) => !added.has(baselineKey(v)))
  };
}

/** The baseline text after fixes: the existing lines that still occur, comments kept. It never gains a line. */
export function shrinkBaseline(text: string, violations: Violation[]): string {
  const still = new Set(violations.map(baselineKey));
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() === "" || line.trim().startsWith("#") || still.has(line.trim()))
    .join("\n");
}

/* ---------------- CLI ---------------- */

interface Args {
  strict: boolean;
  nextId: boolean;
  updateBaseline: boolean;
  github: boolean;
  baseline: string;
  paths: string[];
}

export function parseArgs(argv: string[], env: Record<string, string | undefined> = process.env): Args {
  const args: Args = { strict: false, nextId: false, updateBaseline: false, github: env.GITHUB_ACTIONS === "true", baseline: BASELINE_FILE, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--strict") args.strict = true;
    else if (arg === "--next-id") args.nextId = true;
    else if (arg === "--update-baseline") args.updateBaseline = true;
    else if (arg === "--github") args.github = true;
    else if (arg === "--baseline") args.baseline = argv[++i] ?? BASELINE_FILE;
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else args.paths.push(arg);
  }
  return args;
}

const out = (line: string): void => void process.stdout.write(`${line}
`);
const err = (line: string): void => void process.stderr.write(`${line}
`);

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.nextId) {
    out(nextRuleId());
    return;
  }

  const files = args.paths.length > 0 ? args.paths.map((p) => (isAbsolute(p) ? p : join(REPO_ROOT, p))) : findFeatureFiles();
  const violations = auditFiles(files);
  const baselineFile = isAbsolute(args.baseline) ? args.baseline : join(REPO_ROOT, args.baseline);
  const useBaseline = !args.strict && existsSync(baselineFile);
  const report = evaluate(violations, useBaseline ? readBaseline(baselineFile) : undefined);

  if (args.updateBaseline) {
    if (!useBaseline) throw new Error(`${args.baseline} does not exist; the baseline is created by hand once and only ever shrinks.`);
    if (report.added.length > 0) {
      err(`FAIL: refusing to update ${args.baseline}: ${report.added.length} violation(s) are not in it, and it only ever shrinks. Fix them.`);
      report.added.forEach((v) => err(`  + ${baselineKey(v)}`));
      process.exit(1);
    }
    writeFileSync(baselineFile, shrinkBaseline(readFileSync(baselineFile, "utf8"), violations));
    out(`Updated ${args.baseline}: removed ${report.stale.length} entr${report.stale.length === 1 ? "y" : "ies"}.`);
    return;
  }

  for (const v of report.added) {
    if (args.github) out(annotation(v));
    else err(`${v.file}:${v.line}: ${v.code}: ${v.message}`);
  }
  if (report.stale.length > 0) {
    const message = describeRatchet("ears-audit", args.baseline, { added: [], stale: report.stale });
    if (args.github) out(`::error file=${args.baseline}::${escapeData(message)}`);
    else err(message);
  }

  const rules = files.reduce((n, path) => n + parseGherkin(readText(path)).rules.length, 0);
  const summary = `${files.length} feature file(s), ${rules} Rule(s), ${report.added.length} new violation(s), ${report.baselined.length} baselined, ${report.stale.length} stale baseline entr${report.stale.length === 1 ? "y" : "ies"}.`;
  if (report.added.length > 0 || report.stale.length > 0) {
    err(`FAIL: ${summary}`);
    process.exit(1);
  }
  out(`OK: ${summary}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
