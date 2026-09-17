import ts from "typescript";
import { join } from "node:path";
import { REPO_ROOT, readText, toPosix, walk } from "./lib/repo.ts";

/**
 * Suite-health lints (runway tier O): the checks that stop a test suite from
 * quietly becoming decorative.
 */

export type SuiteFindingKind = "only" | "skip" | "quarantine-expired" | "quarantine-malformed" | "no-assertion";

export interface SuiteFinding {
  kind: SuiteFindingKind;
  file: string;
  title: string;
  line: number;
}

/** Stable baseline line: no line number, so unrelated edits do not churn the baseline. */
export function formatSuiteFinding(finding: SuiteFinding): string {
  return `${finding.kind}: ${finding.file} :: ${finding.title}`;
}

const TEST_FILE = /\.(test|spec|steps)\.(ts|js|mjs)$/;

/** Directories that hold runnable tests. Fixture folders are excluded: they contain deliberate violations. */
export function findTestFiles(root: string = REPO_ROOT): string[] {
  const roots = ["tests", "apps", "packages"].map((dir) => join(root, dir));
  return roots
    .flatMap((dir) => walk(dir, (name) => TEST_FILE.test(name)))
    .filter((path) => !toPosix(path, root).includes("/fixtures/"))
    .sort();
}

const TEST_FNS = new Set(["it", "test"]);
const BLOCK_FNS = new Set(["describe", "suite"]);
const SKIP_MODIFIERS = new Set(["skip", "todo", "skipIf", "fixme"]);
/** Modifiers that still describe a single test or block; anything else (`beforeEach`, `step`, `use`) is not one. */
const TEST_MODIFIERS = new Set(["only", "each", "for", "concurrent", "sequential", "fails", "runIf", "slow", ...SKIP_MODIFIERS]);
const ASSERTION = /\b(expect|assert)\w*\s*[.(<]|\.toThrow|\bexpectTypeOf\b|\b(verify|check|should)[A-Z]\w*\s*\(|\bexpect\b/;

/**
 * A skipped test is allowed without a baseline entry when the line above it
 * carries a dated quarantine with an issue number:
 *
 *   // quarantine: #123 until 2026-10-01
 */
const QUARANTINE = /\/\/\s*quarantine\b(.*)$/i;
const QUARANTINE_VALID = /#\d+\s+until\s+(\d{4}-\d{2}-\d{2})\b/;

interface CalleeShape {
  base: string;
  modifiers: string[];
}

/** `it.skip.each(...)` -> { base: "it", modifiers: ["skip", "each"] }; handles `it.each(table)(...)`. */
function calleeShape(expression: ts.Expression): CalleeShape | undefined {
  if (ts.isIdentifier(expression)) return { base: expression.text, modifiers: [] };
  if (ts.isPropertyAccessExpression(expression)) {
    const inner = calleeShape(expression.expression);
    return inner ? { base: inner.base, modifiers: [...inner.modifiers, expression.name.text] } : undefined;
  }
  if (ts.isCallExpression(expression)) return calleeShape(expression.expression);
  return undefined;
}

function titleOf(call: ts.CallExpression, source: ts.SourceFile): string {
  const first = call.arguments[0];
  if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) return first.text;
  return first ? first.getText(source) : "(untitled)";
}

function lastFunctionArgument(call: ts.CallExpression): ts.FunctionLikeDeclaration | undefined {
  for (let i = call.arguments.length - 1; i >= 0; i--) {
    const arg = call.arguments[i];
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) return arg;
  }
  return undefined;
}

export function lintTestSource(file: string, text: string, today: Date = new Date()): SuiteFinding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lines = text.split(/\r?\n/);
  const findings: SuiteFinding[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const shape = calleeShape(node.expression);
      // For `it.each(table)("title", fn)` only the outer call has the title and body.
      const isInnerOfCurried = ts.isCallExpression(node.parent) && node.parent.expression === node;
      const isBlock = shape && (BLOCK_FNS.has(shape.base) || (TEST_FNS.has(shape.base) && shape.modifiers[0] === "describe"));
      const isTest = shape && TEST_FNS.has(shape.base) && shape.modifiers.every((m) => TEST_MODIFIERS.has(m));
      if (shape && (isBlock || isTest) && !isInnerOfCurried) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const title = titleOf(node, source);
        const mods = new Set(shape.modifiers);

        if (mods.has("only")) findings.push({ kind: "only", file, title, line });

        if ([...mods].some((m) => SKIP_MODIFIERS.has(m))) {
          const quarantine = lines[line - 2]?.match(QUARANTINE);
          if (!quarantine) {
            findings.push({ kind: "skip", file, title, line });
          } else {
            const valid = quarantine[1].match(QUARANTINE_VALID);
            if (!valid) findings.push({ kind: "quarantine-malformed", file, title, line });
            else if (new Date(`${valid[1]}T23:59:59Z`) < today) {
              findings.push({ kind: "quarantine-expired", file, title, line });
            }
          }
        } else if (isTest) {
          const body = lastFunctionArgument(node);
          if (body?.body && !ASSERTION.test(body.body.getText(source))) {
            findings.push({ kind: "no-assertion", file, title, line });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

export function lintTestSuite(root: string = REPO_ROOT, today: Date = new Date()): SuiteFinding[] {
  return findTestFiles(root).flatMap((path) => lintTestSource(toPosix(path, root), readText(path), today));
}

/* ---------------- feature files ---------------- */

function escapeRegExp(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

const CUCUMBER_CONFIGS = ["cucumber.js", "cucumber.mjs", "cucumber.cjs", "cucumber.json", "cucumber.yaml", "cucumber.yml"];

/** Minimal glob: `**` spans directories, `*` stays within one. Enough for cucumber `paths`. */
export function globToRegExp(glob: string): RegExp {
  const pattern = glob
    .replace(/^\.\//, "")
    .split("**/")
    .map((part) =>
      part
        .split("**")
        .map((piece) => piece.split("*").map(escapeRegExp).join("[^/]*"))
        .join(".*")
    )
    .join("(?:.*/)?");
  return new RegExp(`^${pattern}$`);
}

/** Feature globs a cucumber runner loads, read from any cucumber config at the repo root. */
export function executableFeatureGlobs(root: string = REPO_ROOT): string[] {
  const globs: string[] = [];
  for (const name of CUCUMBER_CONFIGS) {
    let text: string;
    try {
      text = readText(join(root, name));
    } catch {
      continue;
    }
    for (const match of text.matchAll(/["']([^"']*\.feature)["']/g)) globs.push(match[1]);
  }
  return globs;
}

export type FeatureFindingKind = "documentation-only" | "no-scenarios";

export function lintFeatureFiles(root: string = REPO_ROOT): { kind: FeatureFindingKind; file: string }[] {
  const globs = executableFeatureGlobs(root).map(globToRegExp);
  return walk(root, (name) => name.endsWith(".feature"))
    .map((path) => ({ path, file: toPosix(path, root) }))
    .filter(({ file }) => !file.includes("/fixtures/"))
    .flatMap(({ path, file }) => {
      if (!/^\s*Scenario( Outline)?:/m.test(readText(path))) return [{ kind: "no-scenarios" as const, file }];
      if (!globs.some((glob) => glob.test(file))) return [{ kind: "documentation-only" as const, file }];
      return [];
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

/* ---------------- uncollected test files ---------------- */

/** What one runner config collects, as repo-relative path patterns. */
export interface TestRunner {
  config: string;
  include: RegExp[];
  exclude: RegExp[];
}

const RUNNER_CONFIG = /^(vitest|playwright)[\w.-]*\.config(\.[\w-]+)?\.[cm]?[jt]s$/;
/** Vitest's and Playwright's default: any `.test` or `.spec` file under the config's directory. */
const DEFAULT_MATCH = /(?:.*\/)?[^/]*\.(test|spec)\.[cm]?[jt]sx?$/;

function stringsOf(node: ts.Expression): string[] | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node) && node.elements.every((e) => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))) {
    return node.elements.map((e) => (e as ts.StringLiteral).text);
  }
  return undefined;
}

/**
 * Reads include/exclude (Vitest, inside `test: {}`) or testDir/testMatch/testIgnore
 * (Playwright, top level) from a config's literal values. A value the check
 * cannot read statically is an error, so a config cannot silently opt out.
 */
export function readRunner(config: string, text: string): TestRunner {
  const source = ts.createSourceFile(config, text, ts.ScriptTarget.Latest, true);
  const values = new Map<string, string[]>();
  const vitest = /(^|\/)vitest/.test(config);
  const wanted = (node: ts.ObjectLiteralElementLike, key: string) => {
    const owner = node.parent.parent;
    if (vitest) return ts.isPropertyAssignment(owner) && ts.isIdentifier(owner.name) && owner.name.text === "test" && (key === "include" || key === "exclude");
    return (ts.isCallExpression(owner) || ts.isExportAssignment(owner)) && ["testDir", "testMatch", "testIgnore"].includes(key);
  };
  const visit = (node: ts.Node) => {
    if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && ts.isIdentifier(node.name) && wanted(node, node.name.text)) {
      const key = node.name.text;
      const strings = ts.isPropertyAssignment(node) ? stringsOf(node.initializer) : undefined;
      if (!strings) throw new Error(`${config}: ${key} is not a string literal or an array of them`);
      values.set(key, strings);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  const configDir = config.includes("/") ? config.slice(0, config.lastIndexOf("/") + 1) : "";
  const testDir = vitest ? "" : (values.get("testDir")?.[0] ?? ".").replace(/^\.\/?/, "").replace(/\/$/, "");
  const base = testDir ? `${configDir}${testDir}/` : configDir;
  // A pattern without a slash matches a file name at any depth, as both runners do.
  const pattern = (glob: string) => {
    const clean = glob.replace(/^\.\//, "");
    return new RegExp(`^${escapeRegExp(base)}${globToRegExp(clean.includes("/") ? clean : `**/${clean}`).source.slice(1)}`);
  };
  const defaultMatch = new RegExp(`^${escapeRegExp(base)}${DEFAULT_MATCH.source}`);
  const include = values.get(vitest ? "include" : "testMatch")?.map(pattern) ?? [defaultMatch];
  return { config, include, exclude: (values.get(vitest ? "exclude" : "testIgnore") ?? []).map(pattern) };
}

export function discoverRunners(root: string = REPO_ROOT): TestRunner[] {
  return walk(root, (name) => RUNNER_CONFIG.test(name))
    .map((path) => toPosix(path, root))
    .filter((file) => !file.includes("/fixtures/"))
    .sort()
    .map((file) => readRunner(file, readText(join(root, file))));
}

/** Test files no runner config collects: they look like coverage and run nowhere. */
export function lintUncollectedTests(root: string = REPO_ROOT): string[] {
  const runners = discoverRunners(root);
  return findTestFiles(root)
    .map((path) => toPosix(path, root))
    .filter((file) => !runners.some((r) => r.include.some((p) => p.test(file)) && !r.exclude.some((p) => p.test(file))))
    .map((file) => `uncollected: ${file}`);
}
