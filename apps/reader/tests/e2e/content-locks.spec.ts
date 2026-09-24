import { test, expect } from "@playwright/test";
import { course, signInAs } from "./support";

// Proves tests/bdd/features/ui/content-locks.feature: one test per scenario, titled and tagged to match.

const simple = "/topic/reference-course/topic-01-typical";
const cardFor = (page: import("@playwright/test").Page, title: string) => page.locator(".resource-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const saturation = (card: import("@playwright/test").Locator) => card.evaluate(el => getComputedStyle(el).filter);

test("Locked card is greyed out for a student", { tag: "@rule-0052" }, async ({ page }) => {
  await page.goto(course);
  await expect(cardFor(page, "Simple")).toBeVisible();
  await signInAs(page, "student", [simple]);
  const card = cardFor(page, "Simple");
  await expect(card).toHaveAttribute("data-locked", "true");
  await expect(card).toContainText("Locked");
  await expect(card.locator("a")).toHaveCount(0);
  expect(await saturation(card)).toContain("grayscale(1)");
  await expect(card.getByRole("button", { name: /Unlock/ })).toHaveCount(0);
});

test("Unlocked card opens for a student", { tag: "@rule-0052" }, async ({ page }) => {
  await page.goto(course);
  await expect(cardFor(page, "Simple")).toBeVisible();
  await signInAs(page, "student");
  const card = cardFor(page, "Simple");
  await expect(card).not.toHaveAttribute("data-locked", "true");
  await expect(card.locator(".resource-link")).toHaveAttribute("href", simple);
  expect(await saturation(card)).toBe("none");
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
  expect(await saturation(card)).toContain("grayscale(1)");
  const unlock = card.getByRole("button", { name: "Unlock Simple" });
  await expect(unlock).toBeVisible();
  await unlock.click();
  await expect(card).not.toHaveAttribute("data-locked", "true");
  expect(await saturation(card)).toBe("none");
});
