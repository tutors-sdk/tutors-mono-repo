import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { course, lab } from "./support";

// Proves tests/bdd/features/ui/accessibility.feature: one test per scenario, titled and tagged to match.

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.filter(v => v.impact === "critical" || v.impact === "serious").map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target.join(" ")) }));
}

async function chooseAppearance(page: Page, mode: "Light" | "Dark", theme?: string) {
  await page.getByRole("button", { name: "Open Theme Menu", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "Preferences", exact: true });
  if (theme) await preferences.getByRole("combobox", { name: "Theme", exact: true }).selectOption(theme);
  await preferences.getByRole("button", { name: mode, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(preferences).not.toBeVisible();
}

test("Course page has no serious violations in light appearance", { tag: "@rule-0051" }, async ({ page }) => {
  await page.goto(course);
  await expect(page.getByRole("heading", { name: "Reference Course", exact: true })).toBeVisible();
  await chooseAppearance(page, "Light");
  expect(await seriousViolations(page)).toEqual([]);
});

test("Course page has no serious violations in dark appearance", { tag: "@rule-0051" }, async ({ page }) => {
  await page.goto(course);
  await expect(page.getByRole("heading", { name: "Reference Course", exact: true })).toBeVisible();
  await chooseAppearance(page, "Dark");
  expect(await seriousViolations(page)).toEqual([]);
});

test("Note in the Dyslexia theme has no serious violations", { tag: "@rule-0051" }, async ({ page }) => {
  await page.goto("/note/tutors-reference-manual/unit-1-getting-started/note-a-getting-started");
  await expect(page.locator(".reading-panel")).toBeVisible();
  await chooseAppearance(page, "Light", "dyslexia");
  expect(await seriousViolations(page)).toEqual([]);
});

const LANDMARKS = /^\s*- (banner|complementary|contentinfo|form|main|navigation|region|search)(?: "((?:[^"\\]|\\.)*)")?/;

/** Named landmarks that share their accessible name with another landmark, read from the accessibility tree. */
async function sharedLandmarkNames(page: Page) {
  const names = (await page.locator("body").ariaSnapshot()).split("\n").map(line => line.match(LANDMARKS)?.[2]).filter((name): name is string => !!name);
  return names.filter((name, i) => names.indexOf(name) !== i);
}

async function openLabStep(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(lab);
  await expect(page.locator(".reading-panel")).toBeVisible();
}

test("Lab page landmarks have distinct names on a desktop", { tag: "@rule-0170" }, async ({ page }) => {
  await openLabStep(page, 1440);
  expect(await sharedLandmarkNames(page)).toEqual([]);
  await expect(page.getByRole("complementary", { name: "Course navigation", exact: true }).getByRole("list", { name: "Steps", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Previous and next step", exact: true }).getByRole("link", { name: /^Next →/ })).toBeVisible();
});

test("Lab page landmarks have distinct names on a phone", { tag: "@rule-0170" }, async ({ page }) => {
  await openLabStep(page, 390);
  await page.getByRole("main").getByText(/^Steps · \d+ \/ \d+$/).click();
  await expect(page.getByRole("main").getByRole("link", { name: /Text$/ }).first()).toBeVisible();
  expect(await sharedLandmarkNames(page)).toEqual([]);
  await expect(page.getByRole("navigation", { name: "Previous and next step", exact: true }).getByRole("link", { name: /^Next →/ })).toBeVisible();
});

test("Course page footer is a landmark outside the main content", { tag: "@rule-0171" }, async ({ page }) => {
  await page.goto(course);
  await expect(page.getByRole("heading", { name: "Reference Course", exact: true })).toBeVisible();
  await expect(page.getByRole("contentinfo", { name: "Site footer", exact: true }).getByRole("link", { name: /^Tutors v:/ })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /^Tutors v:/ })).toHaveCount(0);
});

test("Search result list is named apart from the dialog", { tag: "@rule-0172" }, async ({ page }) => {
  await page.goto(course);
  await expect(page.getByRole("heading", { name: "Reference Course", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Search this course", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search this course", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listbox", { name: "Search results", exact: true })).toBeVisible();
  await expect(dialog.getByRole("listbox", { name: "Search this course", exact: true })).toHaveCount(0);
});
