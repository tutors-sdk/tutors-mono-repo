import { test, expect } from "@playwright/test";

test.describe("Live App Smoke Tests", () => {
  test("homepage loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});
