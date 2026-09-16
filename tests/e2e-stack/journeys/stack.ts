import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

/**
 * Where the stack under test lives. Defaults match tests/e2e-stack/compose.yaml;
 * the release harness overrides them to point at another stack.
 */
export const stack = {
  reader: process.env.READER_URL ?? "http://localhost:3000",
  catalogue: process.env.CATALOGUE_URL ?? "http://localhost:3001",
  live: process.env.LIVE_URL ?? "http://localhost:3002",
  /** The reader with PUBLIC_ANON_MODE and no auth configuration at all. */
  readerUnconfigured: process.env.READER_UNCONFIGURED_URL ?? "http://localhost:3005",
  /** A course id the reader resolves to http://<id>/tutors.json. */
  courseId: process.env.COURSE_ID ?? "localhost:8080",
  /** The same course served by a fixture that answers 500 for tutors.json. */
  brokenCourseId: process.env.BROKEN_COURSE_ID ?? "localhost:8081"
};

/** The fixture course built by tests/e2e-stack/fixture-course/build.ts. Change both together. */
export const fixture = {
  title: "Runway Fixture Course",
  topicTitle: "Topic 1",
  topicPath: "unit-1/topic-01",
  labTitle: "Lab 1",
  labPath: "unit-1/topic-01/book-lab-01",
  firstStep: { id: "Setup", heading: "Lab 1" },
  secondStep: { id: "Step-01", heading: "Step 1" },
  /** Appears in both notes' body; a result links to `<topic>/<note>`. */
  searchTerm: "reference material",
  searchResultTitle: /Topic 1\/Note 1/
};

// Playwright compiles specs to CommonJS, so __dirname rather than import.meta.
const A11Y_BASELINE = resolve(__dirname, "../a11y-known-violations.txt");
const MOTION_BASELINE = resolve(__dirname, "../reduced-motion-known.txt");
/** Every key observed in a run, one JSON line per audit; tests/e2e-stack/ratchet.mjs checks for stale baseline lines. */
const OBSERVED = resolve(process.env.E2E_OBSERVED_FILE ?? resolve(__dirname, "../../../test-results/e2e-stack-observed.jsonl"));

function readBaseline(path: string): Set<string> {
  try {
    return new Set(
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
    );
  } catch {
    return new Set();
  }
}

function record(kind: "a11y" | "motion", testInfo: TestInfo, pageKey: string, keys: string[]) {
  mkdirSync(dirname(OBSERVED), { recursive: true });
  appendFileSync(OBSERVED, `${JSON.stringify({ kind, project: testInfo.project.name, page: pageKey, keys })}\n`);
}

/**
 * Baseline lines are `<project> | <page> :: <finding>`, e.g.
 * `webkit | reader:lab-step :: list`. The page is a name, not a URL, so lines
 * survive fixture changes; the project keeps browser-specific findings apart.
 */
function key(testInfo: TestInfo, pageKey: string, finding: string): string {
  return `${testInfo.project.name} | ${pageKey} :: ${finding}`;
}

/**
 * Run axe on the current page. Any serious or critical violation not in the
 * baseline fails the test (softly, so the journey still audits later pages).
 */
export async function auditAccessibility(page: Page, pageKey: string, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const keys = [...new Set(serious.map((v) => key(testInfo, pageKey, v.id)))].sort();
  record("a11y", testInfo, pageKey, keys);

  const known = readBaseline(A11Y_BASELINE);
  const added = serious.filter((v) => !known.has(key(testInfo, pageKey, v.id)));
  const detail = added.map((v) => `${key(testInfo, pageKey, v.id)}  (${v.impact}: ${v.help}; ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")})`);
  expect.soft(detail, `New serious/critical axe violations on ${pageKey}`).toEqual([]);
}

/**
 * With `prefers-reduced-motion: reduce` emulated, nothing on the page should
 * still animate or transition. Findings are element kinds, ratcheted in
 * reduced-motion-known.txt.
 */
export async function auditReducedMotion(page: Page, pageKey: string, testInfo: TestInfo) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const offenders = await page.evaluate(() => {
    const seconds = (value: string) =>
      Math.max(...value.split(",").map((part) => (part.trim().endsWith("ms") ? parseFloat(part) / 1000 : parseFloat(part) || 0)));
    const found = new Set<string>();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const style = getComputedStyle(element);
      const animates = style.animationName !== "none" && seconds(style.animationDuration) > 0.01;
      const transitions = style.transitionProperty !== "none" && seconds(style.transitionDuration) > 0.01;
      if (!animates && !transitions) continue;
      found.add(`${element.tagName.toLowerCase()} ${animates ? "animation" : `transition(${style.transitionProperty.split(",")[0].trim()})`}`);
    }
    if (getComputedStyle(document.documentElement).scrollBehavior === "smooth") found.add("html scroll-behavior:smooth");
    return [...found].sort();
  });
  await page.emulateMedia({ reducedMotion: null });
  const keys = offenders.map((offender) => key(testInfo, pageKey, offender));
  record("motion", testInfo, pageKey, keys);
  const known = readBaseline(MOTION_BASELINE);
  expect.soft(keys.filter((k) => !known.has(k)), `Elements still moving under prefers-reduced-motion on ${pageKey}`).toEqual([]);
}

/** Collect uncaught page errors so a journey can assert none happened. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
