import { test, expect } from "@playwright/test";

// Proves tests/bdd/features/ui/catalogue.feature: one test per scenario, titled and tagged to match.

test("Catalogue header links have distinct names", { tag: "@rule-0173" }, async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const header = page.getByRole("banner");
  await expect(header.getByRole("link").first()).toBeVisible({ timeout: 60_000 });
  const names = (await header.ariaSnapshot()).split("\n").map(line => line.match(/^\s*- link "((?:[^"\\]|\\.)*)"/)?.[1]).filter((name): name is string => !!name);
  expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  await expect(header.getByRole("link", { name: "Tutors home", exact: true })).toBeVisible();
});
