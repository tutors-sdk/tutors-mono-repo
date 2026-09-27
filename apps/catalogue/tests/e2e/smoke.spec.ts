import { test, expect } from "@playwright/test";

test.describe("Catalogue App Smoke Tests", () => {
  test("homepage loads and shows course list", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tutors Catalogue", exact: true })).toBeVisible({ timeout: 60000 });
  });
});
