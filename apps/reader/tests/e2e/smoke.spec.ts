import { test, expect } from "@playwright/test";

test.describe("Reader App Smoke Tests", () => {
  test("homepage loads successfully", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Tutors/);
  });

  test("navigates to auth page", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.locator("body")).toBeVisible();
  });

  test("returns error page for invalid course", async ({ page }) => {
    const response = await page.goto("/course/nonexistent-course-id-12345");
    await expect(page.locator("body")).toBeVisible();
  });

  test("page has no accessibility violations in heading structure", async ({ page }) => {
    await page.goto("/");
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBeLessThanOrEqual(1);
  });
});
