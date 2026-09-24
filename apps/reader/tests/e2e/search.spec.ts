import { test, expect, type Page } from "@playwright/test";
import { course } from "./support";

// Proves tests/bdd/features/ui/search.feature: one test per scenario, titled and tagged to match.

async function openSearch(page: Page) {
  await page.goto(course);
  await expect(page.getByRole("heading", { name: "Reference Course", exact: true })).toBeVisible();
  await page.locator('[data-tour="search"]').click();
  const dialog = page.getByRole("dialog", { name: "Search this course" });
  return { dialog, box: dialog.getByRole("combobox"), options: dialog.getByRole("option") };
}

test("Search matches every word, not the exact phrase", { tag: "@rule-0056" }, async ({ page }) => {
  const { box, options } = await openSearch(page);
  // "mermaid" and "zipped" are far apart in Note 1; neither sits next to the other anywhere.
  await box.fill("mermaid zipped");
  await expect(options.filter({ hasText: "Note 1" }).first()).toBeVisible();
  await box.fill("mermaid zipped xyzzy");
  await expect(options).toHaveCount(0);
});

test("Title matches come first", { tag: "@rule-0057" }, async ({ page }) => {
  const { box, options } = await openSearch(page);
  // "Videos" is the Videos topic's title, and a step title and note text earlier in the course.
  await box.fill("Videos");
  await expect(options.first()).toContainText("Videos");
  await expect(options.first()).toContainText(/topic/i);
  await expect(options.nth(1)).toBeVisible();
});

test("Opening a result scrolls to the highlighted match", { tag: "@rule-0058" }, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const { box, options } = await openSearch(page);
  // "Gantt charts" is near the end of Note 1's 161 lines.
  await box.fill("gantt charts");
  const note = options.filter({ hasText: "Note 1" }).first();
  await note.click();
  await expect(page).toHaveURL(/\/note\/reference-course\/.*highlight=gantt%20charts/);
  await expect.poll(() => page.evaluate(() => {
    const highlight = (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get("search");
    if (!highlight?.size) return "no highlight";
    const inProse = [...highlight].find(range => range.startContainer.parentElement?.closest(".prose"));
    if (!inProse) return "no match in the content";
    const box = inProse.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight ? "match on screen" : `match at ${Math.round(box.top)}px`;
  })).toBe("match on screen");
});

test.describe("on a touch phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("Touch screens show no keyboard hints", { tag: "@rule-0060" }, async ({ page }) => {
    const { dialog } = await openSearch(page);
    await expect(dialog).toBeVisible();
    await expect(page.locator("kbd:visible")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
  });
});

test("Desktop header shows the search shortcut", { tag: "@rule-0060" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(course);
  await expect(page.locator('[data-tour="search"] kbd')).toHaveText(/^(Ctrl K|⌘K)$/);
});
