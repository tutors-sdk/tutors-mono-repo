import { test, expect, type Page } from "@playwright/test";
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
  await expect(page.locator(".shell-header .brand")).toBeVisible();
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
  await expect(page.locator(".shell-header h1")).toHaveText("Reference Course");
  await expect(page.locator(".shell-header .brand")).toHaveCount(0);
  await expect(page.locator(".composite-heading")).toHaveCount(0);
  await expect(page.locator(".shell-header").getByRole("button", { name: "View Calendar for this course", exact: true })).toHaveCount(0);
  await expect(page.locator(".shell-navigation .calendar-week")).toContainText("This week");
  await expect(page.locator(".main-group .ui-section-heading .ui-muted")).toHaveText("9");
  // The course page reaches its first topic through the topic card itself; there is no separate
  // "start here" callout duplicating that link.
  await page.locator('.resource-link[href="/topic/reference-course/topic-01-typical"]').click();
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

test("Search dialog finds and opens a resource", { tag: "@rule-0055" }, async ({ page }) => {
  await page.goto(course);
  await page.locator('[data-tour="search"]').click();
  const dialog = page.getByRole("dialog", { name: "Search this course" }).or(page.locator(".search-palette[open]"));
  await expect(dialog).toBeVisible();
  const options = dialog.getByRole("option");
  await expect(options.first()).toContainText("Simple");
  await dialog.getByRole("combobox").fill("lab");
  await expect(options.first()).toContainText(/lab/i);
  await dialog.getByRole("combobox").press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  const href = await options.nth(1).getAttribute("href");
  await dialog.getByRole("combobox").press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(href!);
});

test("Keyboard shortcut opens search", { tag: "@rule-0055" }, async ({ page }) => {
  await page.goto(course);
  await expect(page.getByRole("heading", { name: "Reference Course", exact: true })).toBeVisible();
  await page.keyboard.press("Control+k");
  const input = page.locator(".search-palette[open]").getByRole("combobox");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".search-palette[open]")).toHaveCount(0);
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
      await expect(header.getByRole("button", { name: "View Calendar for this course", exact: true })).toHaveCount(0);
      expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth), `${theme} ${width}px header fits`).toBe(true);
      const tree = header.getByRole("button", { name: "Open course tree", exact: true });
      await expect(tree).toHaveText("");
      expect((await tree.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      expect((await header.boundingBox())!.height, `${theme} ${width}px single toolbar`).toBeLessThanOrEqual(65);
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
  await expect(navigation.getByRole("button", { name: "View Calendar for this course", exact: true })).toBeVisible();
  await expect(navigation.locator(".calendar-week")).toContainText("This week");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
});

test("Desktop header shows course info and the sidebar holds the tools", { tag: "@rule-0024" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(course);
  const header = page.locator(".shell-header");
  await expect(header.locator('[data-tour="course-title"]')).toHaveText("Reference Course");
  await expect(header.getByRole("button", { name: "Course navigation", exact: true })).toBeHidden();
  // A multi-page course summary belongs in the scrollable info dialog, not above the topics.
  await page.evaluate(async () => {
    const runes = performance.getEntriesByType("resource").map(entry => entry.name).find(url => url.includes("/runes/src/index.svelte.ts"))!;
    const { currentCourse } = await import(runes);
    currentCourse.value.contentHtml = "";
    currentCourse.value.summary = Array.from({ length: 40 }, (_, i) => `<p>Course summary paragraph ${i + 1}</p>`).join("");
  });
  await expect(page.locator("#main-content")).not.toContainText("Course summary paragraph");
  await header.getByRole("button", { name: "Open course info", exact: true }).click();
  const info = page.getByRole("dialog", { name: "Course Info", exact: true });
  await expect(info).toBeVisible();
  await expect(info.locator(".prose p")).toHaveCount(40);
  await info.getByText("Course summary paragraph 40", { exact: true }).scrollIntoViewIfNeeded();
  await expect(info.getByText("Course summary paragraph 40", { exact: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  const sidebar = page.locator(".shell-navigation");
  await expect(sidebar.getByRole("link", { name: "Edit this course", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Open course info", exact: true })).toHaveCount(0);
  // A short window must scroll the sidebar, never squeeze a multi-line button over the next row.
  await page.setViewportSize({ width: 1440, height: 500 });
  const rows = await sidebar.locator(".nav-row").evaluateAll(elements => elements.map(el => {
    const { top, bottom } = el.getBoundingClientRect();
    return { top, bottom };
  }));
  for (let i = 1; i < rows.length; i++) expect(rows[i].top).toBeGreaterThanOrEqual(rows[i - 1].bottom);

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

test("Closing the online dialog returns focus to its course tools row", { tag: "@rule-0025" }, async ({ page }) => {
  await seedOneOnline(page);
  const viewOnline = page.locator(".shell-navigation").getByRole("button", { name: "View 1 Online", exact: true });
  await viewOnline.click();
  const online = page.getByRole("dialog", { name: "View 1 Online", exact: true });
  await expect(online).toBeVisible();
  await online.getByRole("button", { name: "Close", exact: true }).click();
  await expect(online).not.toBeVisible();
  await expect(viewOnline).toBeFocused();
});

test("Anonymous account menu links home", { tag: "@rule-0026" }, async ({ page }) => {
  await page.goto(course);
  await page.locator('[data-tour="profile"] button').click();
  await page.getByRole("dialog").getByRole("link", { name: "My courses", exact: true }).click();
  await expect(page).toHaveURL("/");
});

test("Account menu holds the sentiment picker", { tag: "@rule-0064" }, async ({ page }) => {
  await seedOneOnline(page);
  await expect(page.locator(".shell-navigation").getByRole("button", { name: /Course sentiment/ })).toHaveCount(0);
  await page.locator('[data-tour="profile"] button').click();
  const menu = page.getByRole("dialog", { name: "Profile menu", exact: true });
  await expect(menu.getByRole("button", { name: /^Course sentiment: neutral/ })).toBeVisible();
  await menu.getByRole("button", { name: /^Course sentiment: neutral/ }).click();
  await page.getByRole("button", { name: "confident", exact: true }).click();
  await expect(menu.getByRole("button", { name: /^Course sentiment: confident/ })).toBeVisible();
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

async function scrollMain(page: Page, top: number) {
  await page.locator(".shell-main").evaluate((main, to) => main.scrollTo({ top: to }), top);
}

test("Phone header hides on scroll down and returns on scroll up", { tag: "@rule-0062" }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(course);
  const header = page.locator(".shell-header");
  await expect(page.locator(".main-group .resource-card").nth(3)).toBeVisible();
  for (const top of [200, 400, 700]) await scrollMain(page, top);
  await expect.poll(async () => (await header.boundingBox())!.y + (await header.boundingBox())!.height).toBeLessThanOrEqual(0);
  await scrollMain(page, 600);
  await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
});

test("Desktop header stays while scrolling", { tag: "@rule-0062" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(course);
  await expect(page.locator(".main-group .resource-card").first()).toBeVisible();
  for (const top of [200, 400, 700]) await scrollMain(page, top);
  await page.waitForTimeout(300);
  expect((await page.locator(".shell-header").boundingBox())!.y).toBe(0);
});
