import { test, expect, type Locator, type Page } from "@playwright/test";
import { course, seedEnrolledLocks, signInAs } from "./support";

// Proves tests/bdd/features/ui/content-locks.feature: one test per scenario, titled and tagged to match.

const simple = "/topic/reference-course/topic-01-typical";
const cardFor = (page: Page, title: string) => page.locator(".resource-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const filterOf = (card: Locator) => card.evaluate(el => getComputedStyle(el).filter);

async function openCourseAsStudent(page: Page, locked: string[], showLocked = false) {
  await page.goto(course);
  await expect(cardFor(page, "Sidebar")).toBeVisible();
  await signInAs(page, "student");
  await seedEnrolledLocks(page, locked, showLocked);
}

test("Locked resource is hidden from a student's cards", { tag: "@rule-0052" }, async ({ page }) => {
  await openCourseAsStudent(page, [simple]);
  await expect(cardFor(page, "Simple")).toHaveCount(0);
  await expect(cardFor(page, "Sidebar")).toBeVisible();
  await expect(page.getByText("8 · Author’s order")).toBeVisible();
});

test("Locked resource is left out of the course tree", { tag: "@rule-0052" }, async ({ page }) => {
  await openCourseAsStudent(page, [simple]);
  await page.getByRole("button", { name: "Open course tree", exact: true }).first().click();
  const tree = page.getByRole("dialog", { name: "Course Tree", exact: true });
  await expect(tree.getByRole("link", { name: "Sidebar", exact: true })).toBeVisible();
  await expect(tree.getByRole("link", { name: "Simple", exact: true })).toHaveCount(0);
});

test("Locked resource is left out of search results", { tag: "@rule-0052" }, async ({ page }) => {
  // "breadcrumbs" appears only in a talk inside the Simple topic.
  await openCourseAsStudent(page, [simple]);
  await page.locator('[data-tour="search"]').click();
  const dialog = page.getByRole("dialog", { name: "Search this course" });
  await dialog.getByRole("combobox").fill("breadcrumbs");
  await expect(dialog.getByText("No resources match your search.")).toBeVisible();
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await dialog.getByRole("link", { name: /Open full search/ }).click();
  await expect(page).toHaveURL(/\/search\/reference-course\?q=breadcrumbs/);
  await expect(page.locator(".search-results .resource-card")).toHaveCount(0);
  // A lecturer sees locked content, so their search finds it.
  await signInAs(page, "lecturer");
  await page.locator('[data-tour="search"]').click();
  await dialog.getByRole("combobox").fill("breadcrumbs");
  await expect(dialog.getByRole("option")).toHaveCount(1);
});

test("Locked resource is left out of the LLM export", { tag: "@rule-0052" }, async ({ page }) => {
  await openCourseAsStudent(page, [simple]);
  await page.locator(".shell-navigation").getByRole("link", { name: /version of this course for LLMs/ }).click();
  await expect(page.getByText("sidebar-llms.txt")).toBeVisible();
  await expect(page.getByText("simple-llms.txt")).toHaveCount(0);
});

test("Unlocked card opens for a student", { tag: "@rule-0052" }, async ({ page }) => {
  await openCourseAsStudent(page, []);
  const card = cardFor(page, "Simple");
  await expect(card).not.toHaveAttribute("data-locked", "true");
  await expect(card.locator(".resource-link")).toHaveAttribute("href", simple);
  expect(await filterOf(card)).toBe("none");
});

test("Locking greys the card out and Unlock restores it", { tag: "@rule-0053" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(course);
  await expect(cardFor(page, "Simple")).toBeVisible();
  await signInAs(page, "lecturer");
  await page.locator(".shell-header").getByRole("button", { name: "Open Lecturer Panel" }).click();
  const panel = page.getByRole("dialog", { name: "Open Lecturer Panel" });
  await panel.getByRole("tab", { name: "Content Locks" }).click();
  await panel.locator(".info-row").filter({ has: page.getByText("Simple", { exact: true }) }).locator('[data-part="control"]').click();
  await page.keyboard.press("Escape");
  const card = cardFor(page, "Simple");
  await expect(card).toHaveAttribute("data-locked", "true");
  expect(await filterOf(card)).toContain("grayscale(1)");
  const unlock = card.getByRole("button", { name: "Unlock Simple" });
  await expect(unlock).toBeVisible();
  await unlock.click();
  await expect(card).not.toHaveAttribute("data-locked", "true");
  expect(await filterOf(card)).toBe("none");
});

test("Locked card is greyed out for a student", { tag: "@rule-0054" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(course);
  await expect(cardFor(page, "Simple")).toBeVisible();
  // The lecturer locks Simple and turns the setting on in the lecturer panel ...
  await signInAs(page, "lecturer");
  await seedEnrolledLocks(page, [simple]);
  await page.locator(".shell-header").getByRole("button", { name: "Open Lecturer Panel" }).click();
  const panel = page.getByRole("dialog", { name: "Open Lecturer Panel" });
  await panel.getByRole("tab", { name: "Content Locks" }).click();
  await panel.locator(".lock-setting [data-part=\"control\"]").click();
  await page.keyboard.press("Escape");
  // ... and a student then sees it greyed out rather than hidden.
  await signInAs(page, "student");
  const card = cardFor(page, "Simple");
  await expect(card).toHaveAttribute("data-locked", "true");
  await expect(card).toContainText("Locked");
  await expect(card.locator("a")).toHaveCount(0);
  expect(await filterOf(card)).toContain("grayscale(1)");
  await expect(card.getByRole("button", { name: /Unlock/ })).toHaveCount(0);
});

test("Without the setting a locked card stays hidden", { tag: "@rule-0054" }, async ({ page }) => {
  await openCourseAsStudent(page, [simple], false);
  await expect(cardFor(page, "Simple")).toHaveCount(0);
  await expect(page.locator('[data-locked="true"]')).toHaveCount(0);
});
