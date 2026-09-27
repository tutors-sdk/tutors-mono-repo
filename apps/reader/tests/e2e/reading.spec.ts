import { test, expect, type Page } from "@playwright/test";
import { lab } from "./support";

// Proves tests/bdd/features/ui/reading.feature: one test per scenario, titled and tagged to match.

async function openWideLab(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(lab);
  const prose = page.locator(".lab-content .reading-panel > article");
  await expect(prose).toBeVisible();
  return { prose, full: page.getByRole("button", { name: "Full width", exact: true }), standard: page.getByRole("button", { name: "Standard", exact: true }) };
}

const width = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!.width;

test("Full width lets lab text fill the panel", { tag: "@rule-0033" }, async ({ page }) => {
  const { prose, full } = await openWideLab(page);
  await full.click();
  await expect(full).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => width(prose)).toBeGreaterThan(1000);
});

test("Standard width keeps lab text to a reading measure", { tag: "@rule-0033" }, async ({ page }) => {
  const { prose, standard } = await openWideLab(page);
  await standard.click();
  await expect(standard).toHaveAttribute("aria-pressed", "true");
  const panel = page.locator(".lab-content .reading-panel");
  expect(Math.abs((await panel.boundingBox())!.width - (await page.locator(".lab-content").boundingBox())!.width)).toBeLessThan(2);
  await expect.poll(() => width(prose)).toBeLessThan(1000);
  expect(await width(prose)).toBeGreaterThan(720);
});

test("Full width survives a reload", { tag: "@rule-0034" }, async ({ page }) => {
  const { full } = await openWideLab(page);
  await full.click();
  await page.reload();
  await expect(full).toHaveAttribute("aria-pressed", "true");
});

test("Step list follows the pager, links, keys and history", { tag: "@rule-0035" }, async ({ page }) => {
  await page.goto(lab);
  const sidebar = page.locator(".shell-navigation");
  const current = sidebar.locator('.steps [aria-current="step"]');
  await expect(current).toHaveText("01 Objectives");
  await page.getByRole("link", { name: "Next → Text", exact: true }).click();
  await expect(current).toHaveText("02 Text");
  await expect(sidebar.getByText("Steps · 2 / 10", { exact: true })).toBeVisible();
  await sidebar.getByRole("link", { name: "04 Links and Code Blocks", exact: true }).click();
  await expect(current).toHaveText("04 Links and Code Blocks");
  await page.locator("#main-content").focus();
  await page.keyboard.press("ArrowRight");
  await expect(current).toHaveText("05 Images");
  await page.goBack();
  await expect(current).toHaveText("04 Links and Code Blocks");
  await expect(sidebar.locator('.steps [aria-current="step"]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Course navigation", exact: true }).click();
  const navigation = page.getByRole("dialog", { name: "Course navigation", exact: true });
  await expect(navigation.locator('.steps [aria-current="step"]')).toHaveText("04 Links and Code Blocks");
  await navigation.getByRole("link", { name: "02 Text", exact: true }).click();
  await expect(navigation).not.toBeVisible();
  await page.getByRole("button", { name: "Course navigation", exact: true }).click();
  await expect(navigation.locator('.steps [aria-current="step"]')).toHaveText("02 Text");
});

test("Note contents start collapsed and code can be copied", { tag: "@rule-0036" }, async ({ page }) => {
  await page.goto("/note/tutors-reference-manual/unit-1-getting-started/note-d-properties");
  const contents = page.locator("details.table-of-contents");
  await expect(contents).not.toHaveAttribute("open");
  await contents.getByText("On this page", { exact: true }).click();
  await expect(contents).toHaveAttribute("open");
  await expect(page.locator("button.copy").first()).toHaveAccessibleName("Copy code");
});

test("Phone tables keep words whole and scroll when too wide", { tag: "@rule-0061" }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${lab}/02`);
  const tables = page.locator(".reading-panel .prose table");
  await expect(tables.first()).toBeVisible();
  // Each heading is a single word ("Option", "Description"), so a heading on more than one line broke a word.
  const lines = await page.locator(".reading-panel .prose th").evaluateAll(cells => cells.map(cell => {
    const range = document.createRange();
    range.selectNodeContents(cell);
    return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size;
  }));
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.every(count => count === 1), `lines per heading: ${lines}`).toBe(true);
  // The reference tables fit a phone, so add one that cannot, as an author with many columns would.
  const scroll = await page.locator(".reading-panel .prose").evaluate(prose => {
    const table = document.createElement("table");
    table.innerHTML = `<tr>${Array.from({ length: 8 }, (_, i) => `<th>Column${i}Heading</th>`).join("")}</tr>`;
    prose.append(table);
    return { table: table.scrollWidth > table.clientWidth, page: document.documentElement.scrollWidth <= innerWidth };
  });
  expect(scroll).toEqual({ table: true, page: true });
});
