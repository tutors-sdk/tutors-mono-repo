import { test, expect } from "@playwright/test";
import { course, fitsViewport, lab, seedOneOnline } from "./support";

// Proves tests/bdd/features/ui/shell-and-navigation.feature: one test per scenario, titled and tagged to match.

test("Lab pages fit every viewport width", { tag: "@rule-0019" }, async ({ page }) => {
  await page.goto(`${lab}/02`);
  await expect(page.locator(".reading-panel")).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await fitsViewport(page), `${width}px`).toBe(true);
  }
});

test("Home page introduces Tutors above the courses", { tag: "@rule-0020" }, async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Tutors/);
  const intro = page.getByRole("region", { name: "An Open Learning Web Toolkit" });
  await expect(intro.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(intro.getByRole("link", { name: "Create", exact: true })).toBeVisible();
  const introBox = (await intro.boundingBox())!;
  const courses = (await page.getByRole("heading", { name: "Welcome to Tutors", exact: true }).boundingBox())!;
  expect(introBox.y + introBox.height).toBeLessThan(courses.y);
});

test("Course home leads to the first topic", { tag: "@rule-0021" }, async ({ page }) => {
  await page.goto(course);
  await expect(page.getByRole("heading", { name: "Reference Course", exact: true })).toBeVisible();
  await expect(page.getByText("9 · Author’s order")).toBeVisible();
  await page.getByRole("link", { name: "Open topic →", exact: true }).click();
  await page.locator(`.resource-link[href="${lab}"]`).click();
  await expect(page.getByRole("heading", { name: "Objectives", exact: true })).toBeVisible();
});

test("Breadcrumbs name the parent course", { tag: "@rule-0022" }, async ({ page }) => {
  await page.goto(course);
  const trail = page.getByRole("navigation", { name: "Breadcrumbs", exact: true });
  await expect(trail.getByRole("listitem").filter({ hasNotText: "/" })).toHaveText(["My courses", "Tutors Reference Manual", "Reference Course"]);
});

test("Search lists each matching resource once", { tag: "@rule-0023" }, async ({ page }) => {
  await page.goto("/search/reference-course");
  await page.getByRole("searchbox", { name: "Enter search term:", exact: true }).fill("lab");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\?q=lab/);
  await expect(page.locator(".search-results .resource-card")).not.toHaveCount(0);
  const links = await page.locator(".search-results .resource-link").evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute("href")));
  expect(new Set(links).size).toBe(links.length);
});

test("Phone header opens the course tree and navigation", { tag: "@rule-0024" }, async ({ page }) => {
  await page.goto(course);
  const header = page.locator(".shell-header");
  for (const theme of ["tutors", "dyslexia"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await header.getByRole("button", { name: "Open Theme Menu", exact: true }).click();
    await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption(theme);
    await page.keyboard.press("Escape");
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(header.locator('[data-tour="course-title"]')).toBeVisible();
      expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth), `${theme} ${width}px header fits`).toBe(true);
      const tree = header.getByRole("button", { name: "Open course tree", exact: true });
      await expect(tree).toContainText("Course Tree");
      await tree.click();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(page.getByRole("dialog", { name: "Course Tree", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(tree).toBeFocused();
    }
  }
  const menu = header.getByRole("button", { name: "Course navigation", exact: true });
  await menu.click();
  const navigation = page.getByRole("dialog", { name: "Course navigation", exact: true });
  await expect(navigation.getByRole("link", { name: "Edit this course", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
});

test("Desktop header shows course info and the sidebar holds the tools", { tag: "@rule-0024" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(course);
  const header = page.locator(".shell-header");
  await expect(header.locator('[data-tour="course-title"]')).toHaveText("Reference Course");
  await expect(header.getByRole("button", { name: "Course navigation", exact: true })).toBeHidden();
  await header.getByRole("button", { name: "Open course info", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Course Info", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const sidebar = page.locator(".shell-navigation");
  await expect(sidebar.getByRole("link", { name: "Edit this course", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Open course info", exact: true })).toHaveCount(0);
});

test("Closing the preferences menu returns focus to its button", { tag: "@rule-0025" }, async ({ page }) => {
  await page.goto(course);
  const button = page.getByRole("button", { name: "Open Theme Menu", exact: true });
  await button.click();
  const preferences = page.getByRole("dialog", { name: "Preferences", exact: true });
  await expect(preferences).toBeVisible();
  // The popover moves focus in and starts listening for Escape on the next frame; wait for that, as a person would.
  await expect.poll(() => preferences.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(preferences).not.toBeVisible();
  await expect(button).toBeFocused();
});

test("Closing the online dialog returns focus to the account button", { tag: "@rule-0025" }, async ({ page }) => {
  await seedOneOnline(page);
  const account = page.locator('[data-tour="profile"] .paper-menu-trigger');
  await account.click();
  await page.getByRole("button", { name: "View 1 Online", exact: true }).click();
  const online = page.getByRole("dialog", { name: "View 1 Online", exact: true });
  await expect(online).toBeVisible();
  await online.getByRole("button", { name: "Close", exact: true }).click();
  await expect(account).toHaveAttribute("aria-expanded", "false");
  await expect(account).toBeFocused();
});

test("Anonymous account menu links home", { tag: "@rule-0026" }, async ({ page }) => {
  await page.goto(course);
  await page.locator('[data-tour="profile"] button').click();
  await page.getByRole("dialog").getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
});

test("Header controls share one style", { tag: "@rule-0027" }, async ({ page }) => {
  await page.goto(course);
  const search = page.locator('[data-tour="search"]');
  const preferences = page.locator('[data-tour="layout"]');
  await expect(search).toBeVisible();
  for (const property of ["font-size", "font-weight", "color", "padding", "min-height"]) {
    expect(await search.evaluate((el, key) => getComputedStyle(el).getPropertyValue(key), property), property)
      .toBe(await preferences.evaluate((el, key) => getComputedStyle(el).getPropertyValue(key), property));
  }
});

test("Unknown course shows Page Not Found", { tag: "@rule-0028" }, async ({ page }) => {
  await page.goto("/course/nonexistent-course-id-12345");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("404");
  await expect(alert).toContainText("Page Not Found");
  await expect(alert.getByRole("link", { name: "Go Home" })).toHaveAttribute("href", "/");
});
