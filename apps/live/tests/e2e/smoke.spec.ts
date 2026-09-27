import { test, expect } from "@playwright/test";

test.describe("Live App Smoke Tests", () => {
  test("homepage loads", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tutors Live", exact: true })).toBeVisible({ timeout: 60000 });
  });
});
