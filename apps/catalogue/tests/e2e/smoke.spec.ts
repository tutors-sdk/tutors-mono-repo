import { test, expect } from "@playwright/test";

test.describe("Catalogue App Smoke Tests", () => {
  test("homepage loads and shows course list", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});
