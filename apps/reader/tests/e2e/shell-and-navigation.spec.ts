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
  await expect(page.locator(".main-group .ui-section-heading")).toHaveText("Course topics");
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
  await expect.poll(() => navigation.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(navigation).not.toBeVisible();
  await expect(menu).toBeFocused();
});

test("Desktop sidebar holds course info and the tools", { tag: "@rule-0024" }, async ({ page }) => {
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
  const sidebar = page.locator(".shell-navigation");
  await expect(header.getByRole("button", { name: "Open course info", exact: true })).toHaveCount(0);
  await sidebar.getByRole("button", { name: "Open course info", exact: true }).click();
  const info = page.getByRole("dialog", { name: "Course Info", exact: true });
  await expect(info).toBeVisible();
  await expect(info.locator(".prose p")).toHaveCount(40);
  await info.getByText("Course summary paragraph 40", { exact: true }).scrollIntoViewIfNeeded();
  await expect(info.getByText("Course summary paragraph 40", { exact: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(sidebar.getByRole("link", { name: "Edit this course", exact: true })).toBeVisible();
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
  const viewOnline = page.locator(".shell-navigation").getByRole("button", { name: "View Online 1", exact: true });
  await viewOnline.click();
  const online = page.getByRole("dialog", { name: "View Online", exact: true });
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

test("Footer fills short pages and follows long content", { tag: "@rule-0241" }, async ({ page }) => {
  await page.goto("/llm/tutors-reference-manual");
  await expect(page.getByRole("heading", { name: "Docs for LLMs", exact: true })).toBeVisible();
  const footer = page.getByRole("contentinfo", { name: "Site footer", exact: true });
  const scroller = page.locator(".shell-main");
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 2000 });
    await scrollMain(page, 0);
    await expect.poll(() => footer.evaluate(el => Math.round(el.getBoundingClientRect().bottom)), `${width}px short page`).toBe(2000);
    expect(await scroller.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);

    await page.setViewportSize({ width, height: 400 });
    await scrollMain(page, 0);
    await expect(footer).not.toBeInViewport();
    const mainBox = (await page.getByRole("main").boundingBox())!;
    expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(mainBox.y + mainBox.height);
    await scrollMain(page, 1_000_000);
    await expect(footer).toBeInViewport();
    await expect.poll(() => footer.evaluate(el => Math.round(el.getBoundingClientRect().bottom)), `${width}px long page`).toBe(400);
  }
});

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

test("The side menu leads with a card for what is open", { tag: "@rule-0260" }, async ({ page }) => {
  await page.goto("/topic/reference-course/topic-01-typical");
  const column = page.locator(".shell-navigation .navigation-scroll");
  const card = column.locator(".lo-card");
  await expect(card).toBeVisible();
  await expect(column.locator("> *").first()).toHaveClass(/lo-card/);
  // Title, artwork and summary: the three things the canvas heading used to carry.
  await expect(card.getByRole("heading")).toHaveText("Simple");
  await expect(card.locator(".lo-artwork")).toBeVisible();
  await expect(card.locator(".lo-card-summary")).toHaveText("Units with presentations, labs + resources");
  // Scaled to the column: as wide as the menu allows, and no wider.
  const [cardBox, columnBox] = [(await card.boundingBox())!, (await column.boundingBox())!];
  expect(Math.round(cardBox.width)).toBeLessThanOrEqual(Math.round(columnBox.width));
  expect(cardBox.width).toBeGreaterThan(columnBox.width * 0.8);
  // The way out sits right under the card. From a topic that is the course.
  const back = column.locator(".back-link");
  await expect(back).toHaveText("← Reference Course");
  await expect(back).toHaveAttribute("href", course);
  expect((await back.boundingBox())!.y).toBeGreaterThan(cardBox.y + cardBox.height - 1);
  // And the canvas no longer shows it: its only heading naming the topic is the hidden level-1 one (Rule 0262).
  await expect(page.locator("#main-content").getByRole("heading", { name: "Simple", exact: true, level: 2 })).toHaveCount(0);
  // Opening a note swaps the card for that note's.
  await page.goto("/note/tutors-reference-manual/unit-1-getting-started/note-a-getting-started");
  await expect(card.getByRole("heading")).toHaveText("Getting Started");
  await expect(card.locator(".lo-card-summary")).toHaveText("The basic model of Tutors");
});

test("Labs and notebooks keep their context compact", { tag: "@rule-0260" }, async ({ page }) => {
  const notebook = "/notebook/reference-course/topic-01-typical/unit-1/notebook-a";
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 720 });
    for (const route of [lab, notebook]) {
      await page.goto(route);
      if (width < 1024) await page.getByRole("button", { name: "Course navigation", exact: true }).click();
      const column = page.locator(width < 1024 ? ".drawer-body .navigation-scroll" : ".shell-navigation .navigation-scroll");
      const context = column.locator(".lo-context");
      const heading = context.locator("summary");
      const card = context.locator(".lo-card");
      await expect(column.locator("> *").first()).toHaveClass(/lo-context/);
      await expect(heading).toBeVisible();
      await expect(card).toBeHidden();
      const artwork = (await heading.locator(".lo-artwork").boundingBox())!;
      expect(artwork.width).toBe(48);
      expect(artwork.height).toBe(48);
      // Read one layout snapshot: icon/font hydration can reflow between separate boundingBox calls.
      const [headingBox, backBox, stepsBox] = await column.locator(".lo-context > summary, .back-link, .steps").evaluateAll(elements =>
        elements.map(el => { const { y, height } = el.getBoundingClientRect(); return { y, height }; })
      );
      expect(headingBox.height).toBeGreaterThanOrEqual(44);
      expect(headingBox.height).toBeLessThan(160);
      expect(backBox.y).toBeGreaterThan(headingBox.y + headingBox.height);
      expect(stepsBox.y).toBeGreaterThan(headingBox.y + headingBox.height);
      expect(await fitsViewport(page), `${route} at ${width}px`).toBe(true);
      // Native disclosure works with a keyboard and exposes the existing full card.
      const title = await heading.locator("strong").textContent();
      await heading.focus();
      await page.keyboard.press("Space");
      await expect(context).toHaveAttribute("open", "");
      await expect(card).toBeVisible();
      await expect(card.getByRole("heading")).toHaveText(title!);
      await expect(card.locator(".lo-card-summary")).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(context).not.toHaveAttribute("open");
      await expect(card).toBeHidden();
      if (width < 1024) {
        await column.locator(".steps a").first().click();
        await expect(page.getByRole("dialog", { name: "Course navigation", exact: true })).toBeHidden();
      }
    }
  }
});

test("Every kind of resource gets the same way back", { tag: "@rule-0260" }, async ({ page }) => {
  const topic = "/topic/reference-course/topic-01-typical";
  const column = page.locator(".shell-navigation .navigation-scroll");
  const back = column.locator(".back-link");
  // A lab's compact context keeps the same way back above the step list.
  await page.goto(`${topic}/unit-1/book-a`.replace("/topic/", "/lab/"));
  await expect(column.locator(".lo-context-heading strong")).toHaveText("Lab-01-(md)");
  await expect(back).toHaveText("← Simple");
  await expect(back).toHaveAttribute("href", topic);
  expect((await back.boundingBox())!.y).toBeLessThan((await column.locator(".steps").boundingBox())!.y);
  // The kinds that never had one get the same link to the same place.
  for (const route of [`${topic}/unit-1/notebook-a`.replace("/topic/", "/notebook/"), `${topic}/unit-1/talk-1-intro`.replace("/topic/", "/talk/")]) {
    await page.goto(route);
    await expect(back, route).toHaveText("← Simple");
    await expect(back, route).toHaveAttribute("href", topic);
  }
});

test("A topic page keeps a hidden level-1 heading", { tag: "@rule-0262" }, async ({ page }) => {
  await page.goto("/topic/reference-course/topic-01-typical");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText("Simple");
  // Present for screen readers and heading navigation, but not drawn: the side menu's card shows the title.
  const box = (await h1.boundingBox())!;
  expect(box.width * box.height).toBeLessThanOrEqual(1);
  await expect(page.locator(".shell-navigation .lo-card").getByRole("heading")).toHaveText("Simple");
});

const CREDITS = "A reference course containing all supported learning objects";

test("Credits follow the course title in the header", { tag: "@rule-0261" }, async ({ page }) => {
  const title = page.locator(".shell-header .course-title");
  const credits = page.locator(".shell-header .course-credits");
  const fontSize = (what: typeof title) => what.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(course);
  await expect(title).toHaveText("Reference Course");
  await expect(credits).toHaveText(CREDITS);
  // After the title, and quieter than it.
  const titleBox = (await title.boundingBox())!;
  expect((await credits.boundingBox())!.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
  expect(await fontSize(credits)).toBeLessThan(await fontSize(title));
  // The credits belong to the course, so they travel with its title rather than staying on its front page.
  await page.goto(lab);
  await expect(credits).toHaveText(CREDITS);
  // Too long for the header: one line, cut off at the end, and nothing scrolls sideways.
  await page.setViewportSize({ width: 1024, height: 900 });
  const shape = await credits.evaluate((el) => ({ lines: el.scrollHeight / parseFloat(getComputedStyle(el).lineHeight), clipped: el.scrollWidth > el.clientWidth }));
  expect(shape.lines).toBeLessThan(2);
  expect(shape.clipped).toBe(true);
  expect(await fitsViewport(page)).toBe(true);
});

test("A narrow header carries the title alone", { tag: "@rule-0261" }, async ({ page }) => {
  const credits = page.locator(".shell-header .course-credits");
  for (const width of [1023, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(course);
    await expect(page.locator(".shell-header .course-title"), `${width}px`).toHaveText("Reference Course");
    await expect(credits, `${width}px`).toBeHidden();
  }
  // The same course one pixel wider does name them, so the narrow header is hiding the credits, not missing them.
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(credits).toHaveText(CREDITS);
});

test("Away from a course the navigation leads with its own sections", { tag: "@rule-0260" }, async ({ page }) => {
  const column = page.locator(".shell-navigation .navigation-scroll");
  // The course's own front page: the header names and pictures the course, so the menu does not repeat it.
  await page.goto(course);
  await expect(column.locator("> *").first()).toHaveText("Learn");
  await expect(column.locator(".lo-card, .lo-context")).toHaveCount(0);
  await page.goto("/topic/reference-course/topic-01-typical");
  await expect(column.locator(".lo-card")).toBeVisible();
  // currentLo survives leaving the course, so the home page is where a stale card would show up.
  await page.goto("/");
  await expect(column.locator("> *").first()).toHaveText("Tutors");
  await expect(column.locator(".lo-card, .lo-context")).toHaveCount(0);
});
