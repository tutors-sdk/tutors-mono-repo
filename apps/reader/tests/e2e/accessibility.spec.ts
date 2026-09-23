import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { course } from "./support";

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
