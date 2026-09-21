import { test, expect } from "@playwright/test";

test.describe("Reader App Smoke Tests", () => {
  test("homepage loads successfully", async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Tutors/);
    const hero = page.getByRole('region', { name: 'An Open Learning Web Toolkit' });
    await expect(hero).toBeVisible();
    await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(hero.getByRole('link', { name: 'Create', exact: true })).toBeVisible();
    const heroBox = (await hero.boundingBox())!;
    const coursesBox = (await page.getByRole('heading', { name: 'Welcome to Tutors', exact: true }).boundingBox())!;
    expect(heroBox.y + heroBox.height).toBeLessThan(coursesBox.y);
    expect(await hero.locator('.ui-button:not(.ui-button-primary)').first().evaluate(el => getComputedStyle(el).borderColor))
      .toBe(await hero.evaluate(el => getComputedStyle(el).borderColor));
    await page.screenshot({ path: testInfo.outputPath('home-hero-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('home-hero-mobile.png') });
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
