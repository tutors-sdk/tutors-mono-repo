import { test, expect, type Page } from "@playwright/test";
import { course, seedOneOnline } from "./support";

// Proves tests/bdd/features/ui/course-tools.feature: one test per scenario, titled and tagged to match.

const manual = "/course/tutors-reference-manual";

async function openCalendar(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(course);
  await page.locator(".shell-navigation").getByRole("button", { name: "View Calendar for this course" }).click();
  const calendar = page.getByRole("dialog", { name: "Semester 1 · 2026", exact: true });
  await expect(calendar.locator("tbody tr")).toHaveCount(16);
  return calendar;
}

test("Course tree opens a page and marks it current", { tag: "@rule-0040" }, async ({ page }) => {
  await page.goto("/note/tutors-reference-manual/unit-1-getting-started/note-d-properties");
  await page.getByRole("button", { name: "Open course tree", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Course Properties", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Mermaid Diagrams", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page).toHaveURL(/note-a-mermaid$/);
  await page.getByRole("button", { name: "Open course tree", exact: true }).click();
  const tree = page.getByRole("dialog");
  await expect(tree.getByRole("link", { name: "Mermaid Diagrams", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(tree.locator('a[aria-current="page"]')).toHaveCount(1);
});

test("Course tree counts stay aligned when a branch opens", { tag: "@rule-0041" }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(manual);
  await page.getByRole("button", { name: "Open course tree", exact: true }).click();
  const sections = page.getByRole("dialog").locator(".tree-section");
  await expect(sections).toHaveCount(5);
  const positions = () => sections.evaluateAll(rows => rows.map(row => {
    const count = row.querySelector(".tree-count")!.getBoundingClientRect();
    const chevron = row.querySelector(".tree-chevron svg")!.getBoundingClientRect();
    const title = row.querySelector(".tree-section-title")!.getBoundingClientRect();
    return { right: count.right, arrowX: chevron.x, offset: Math.abs(count.y + count.height / 2 - chevron.y - chevron.height / 2), titleOffset: Math.abs(count.y + count.height / 2 - title.y - title.height / 2) };
  }));
  const before = await positions();
  await sections.nth(1).click();
  for (const row of await positions()) {
    expect(row.right).toBe(before[0].right);
    expect(row.arrowX).toBe(before[0].arrowX);
    expect(row.offset).toBeLessThan(1);
    expect(row.titleOffset).toBeLessThan(1);
  }
});

test("Calendar filters to assessment weeks", { tag: "@rule-0042" }, async ({ page }) => {
  const calendar = await openCalendar(page);
  await expect(calendar.locator(".week-number").first()).toHaveText("Week No. 0");
  await calendar.getByRole("combobox", { name: "Show", exact: true }).selectOption("assessments");
  await expect(calendar.locator("tbody tr")).toHaveCount(3);
});

test("This week focuses the current week", { tag: "@rule-0043" }, async ({ page }) => {
  const calendar = await openCalendar(page);
  await calendar.getByRole("combobox", { name: "Show", exact: true }).selectOption("assessments");
  await calendar.getByRole("button", { name: "This week", exact: true }).click();
  await expect(calendar.locator("tbody tr")).toHaveCount(16);
  await expect(calendar.locator('[aria-current="date"]')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await calendar.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await calendar.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(/\/course\/reference-course$/);
});

test("Tour points at the visible course tree control", { tag: "@rule-0044" }, async ({ page }) => {
  await page.goto(manual);
  const preferences = page.getByRole("button", { name: "Open Theme Menu", exact: true });
  const tour = page.getByRole("dialog", { name: "Guided tour", exact: true });
  // Responsive layouts can leave a hidden copy ahead of the visible target.
  await page.evaluate(() => {
    const hidden = document.createElement("div");
    hidden.dataset.tour = "toc";
    hidden.style.display = "none";
    document.body.prepend(hidden);
  });
  for (const theme of ["tutors", "dyslexia"]) {
    await preferences.click();
    await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption(theme);
    await page.getByRole("button", { name: "Start Tour", exact: true }).click();
    for (let step = 0; step < 4; step++) await tour.getByRole("button", { name: "Next", exact: true }).click();
    await expect(tour.getByRole("heading", { name: "Course Tree", exact: true })).toBeVisible();
    const target = (await page.locator('[data-tour="toc"]:visible').boundingBox())!;
    const tooltip = page.locator(".tour-tooltip");
    await expect.poll(async () => Math.abs((await tooltip.boundingBox())!.x - target.x - target.width - 12), theme).toBeLessThan(1);
    const box = (await tooltip.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(16);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height - 14);
    expect(await tooltip.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await tour.getByRole("button", { name: "Done", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(tour.locator('button:not([tabindex="-1"])').first()).toBeFocused();
    await tour.getByRole("button", { name: "Done", exact: true }).click();
    await expect(tour).not.toBeVisible();
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await preferences.click();
  await page.getByRole("button", { name: "Start Tour", exact: true }).click();
  for (let step = 0; step < 4; step++) await tour.getByRole("button", { name: "Next", exact: true }).click();
  await expect(tour.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  expect(await page.locator(".tour-tooltip").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(tour).not.toBeVisible();
});

test("Course creator downloads the new course", { tag: "@rule-0045" }, async ({ page }) => {
  await page.goto("/create");
  await page.getByLabel("Course Name", { exact: false }).fill("UI test course");
  await page.getByRole("button", { name: "Next →", exact: true }).click();
  await page.getByLabel("Number of Units", { exact: true }).fill("1");
  await page.getByLabel("Topics per Unit", { exact: true }).fill("1");
  await page.getByLabel("Include a README", { exact: true }).check();
  await page.getByLabel("README description", { exact: true }).fill("A course for testing the new UI.");
  await page.getByRole("button", { name: "Next →", exact: true }).click();
  await page.getByText("course.md", { exact: true }).click();
  await expect(page.locator("details[open] pre")).toContainText("UI test course");
  await page.getByRole("button", { name: "Generate →", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ui-test-course.zip", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("ui-test-course.zip");
  await expect(page.getByText("Downloaded!", { exact: true })).toBeVisible();
});

test("Online list opens as a dialog", { tag: "@rule-0046" }, async ({ page }) => {
  await seedOneOnline(page);
  // The count stays on the avatar as an indicator; the list itself is a course tool.
  await expect(page.locator('[data-tour="profile"] .paper-menu-trigger .online-count')).toHaveText("1");
  await page.locator(".shell-navigation").getByRole("button", { name: "View 1 Online", exact: true }).click();
  const online = page.getByRole("dialog", { name: "View 1 Online", exact: true });
  await expect(online).toBeVisible();
  await expect(online).toHaveAttribute("data-presentation", "dialog");
  await expect(online).toContainText("UI Preview");
  const card = (await online.locator(".activity-card").boundingBox())!;
  const grid = (await online.locator(".online-grid").boundingBox())!;
  expect(card.width).toBeLessThan(grid.width * 0.6);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await online.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(online).toHaveCSS("height", "844px");
});

test("Course tools withholds class activity from a student", { tag: "@rule-0063" }, async ({ page }) => {
  await seedOneOnline(page);
  const navigation = page.locator(".shell-navigation");
  await expect(navigation.getByRole("link", { name: "My time", exact: true })).toHaveAttribute("href", "/time/reference-course");
  await expect(navigation.getByRole("link", { name: "Live now" })).toHaveAttribute("href", "https://live.tutors.dev/reference-course");
  await expect(navigation.getByRole("button", { name: "View 1 Online", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Class activity" })).toHaveCount(0);
});

test("Course tools offers class activity to an educator", { tag: "@rule-0063" }, async ({ page }) => {
  await seedOneOnline(page, { educator: true });
  const classActivity = page.locator(".shell-navigation").getByRole("link", { name: "Class activity" });
  await expect(classActivity).toHaveAttribute("href", "https://time.tutors.dev/reference-course");
  await expect(classActivity).toHaveAttribute("target", "_blank");
});
