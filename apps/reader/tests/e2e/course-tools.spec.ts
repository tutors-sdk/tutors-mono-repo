import { test, expect, type Locator, type Page } from "@playwright/test";
import { course, lab, seedOneOnline, signInAs } from "./support";

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
    // Advance until the step arrives rather than counting to it: which steps a tour has depends on
    // the page and the course, and this Rule is about where the tour sits, not how far along it is.
    await advanceTourTo(tour, "Course Tree");
    const target = (await page.locator('[data-tour="toc"]:visible').boundingBox())!;
    const tooltip = page.locator(".tour-tooltip");
    await expect.poll(async () => Math.abs((await tooltip.boundingBox())!.x - target.x - target.width - 12), theme).toBeLessThan(1);
    const box = (await tooltip.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(16);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height - 14);
    expect(await tooltip.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const tabbable = tour.locator('button:not([tabindex="-1"])');
    await tabbable.last().focus();
    await page.keyboard.press("Tab");
    await expect(tabbable.first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(tour).not.toBeVisible();
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await preferences.click();
  await page.getByRole("button", { name: "Start Tour", exact: true }).click();
  await advanceTourToEnd(tour);
  expect(await page.locator(".tour-tooltip").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(tour).not.toBeVisible();
});

/** Moves the open tour forward until its heading reads `title`. */
async function advanceTourTo(tour: Locator, title: string) {
  const heading = tour.getByRole("heading");
  for (let step = 0; step < 40; step++) {
    if ((await heading.innerText()).trim() === title) return;
    await tour.getByRole("button", { name: "Next", exact: true }).click();
  }
  throw new Error(`the tour never reached the "${title}" step`);
}

/** Moves the open tour forward to its last step, the one whose forward button reads Done. */
async function advanceTourToEnd(tour: Locator) {
  const done = tour.getByRole("button", { name: "Done", exact: true });
  for (let step = 0; step < 40; step++) {
    if (await done.isVisible()) return;
    await tour.getByRole("button", { name: "Next", exact: true }).click();
  }
  throw new Error("the tour never reached its last step");
}

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

/**
 * Each row of the sidebar's Learn section, in order, with its position among the scroll container's
 * children so a tour frame can be matched back to it. Learn runs from its own heading to whichever
 * comes first: the next section heading, or a section group.
 */
async function learnRows(page: Page): Promise<{ index: number; text: string }[]> {
  return page.locator(".shell-navigation .navigation-scroll").evaluate(scroll => {
    const children = [...scroll.children];
    const learn = children.findIndex(el => el.matches(".nav-section") && el.textContent?.trim() === "Learn");
    const rows: { index: number; text: string }[] = [];
    for (let i = learn + 1; i < children.length; i++) {
      if (children[i].matches(".nav-section, .tool-section")) break;
      rows.push({ index: i, text: children[i].textContent!.trim() });
    }
    return rows;
  });
}

/** The text of each Learn row, in order. */
const learnText = async (page: Page) => (await learnRows(page)).map(row => row.text);

test("Learn section ends with Educator Control for an educator", { tag: "@rule-0217" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(course);
  // Seeding into a half-loaded course is wiped when the course finishes settling its roles, so wait
  // for the course to be on screen before signing in.
  await page.getByRole("heading", { name: "Reference Course", exact: true }).waitFor();
  await signInAs(page, "lecturer");
  const sidebar = page.locator(".shell-navigation");
  // The row appears when the seeded role reaches the sidebar, a frame or two after signInAs returns.
  await expect(sidebar.getByRole("button", { name: "Open Educator Control", exact: true })).toBeVisible({ timeout: 15_000 });
  const rows = await learnText(page);
  expect(rows.at(-1)).toBe("Educator Control");
  expect(rows).toContain("Course Info");
  await sidebar.getByRole("button", { name: "Open Educator Control", exact: true }).click();
  // Course info is its own row a few lines above, so the panel is administration only and opens on it.
  const panel = page.getByRole("dialog", { name: "Educator Control", exact: true });
  await expect(panel.getByRole("tab", { name: "Content Locks", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("tab", { name: "Course Info", exact: true })).toHaveCount(0);
});

test("Learn section withholds Educator Control from a student", { tag: "@rule-0217" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(course);
  await page.getByRole("heading", { name: "Reference Course", exact: true }).waitFor();
  await signInAs(page, "student");
  const sidebar = page.locator(".shell-navigation");
  await expect(sidebar.getByRole("button", { name: "Open course info", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(sidebar.getByRole("button", { name: "Open Educator Control" })).toHaveCount(0);
  const rows = await learnText(page);
  expect(rows).toContain("Course Info");
  expect(rows).not.toContain("Educator Control");
});

/**
 * Opens Preferences and starts the guided tour from it, the only way in. The seeding helpers open
 * and close that menu themselves, so a click that lands while it is still shutting toggles it back
 * closed: open it until Start Tour is actually there rather than assuming one click did it.
 */
async function startTour(page: Page) {
  const start = page.getByRole("button", { name: "Start Tour", exact: true });
  await expect(async () => {
    if (!(await start.isVisible())) await page.getByRole("button", { name: "Open Theme Menu", exact: true }).click();
    await expect(start).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await start.click();
  await expect(page.getByRole("dialog", { name: "Guided tour", exact: true })).toBeVisible();
}

interface TourFrame {
  title: string;
  /** True on the step whose forward button reads Done. */
  last: boolean;
  /** Position of the side menu child the frame sits on among the scroll container's children, or -1. */
  menuChild: number;
  menuText: string | null;
  /** True when the frame is drawn around the whole of that child rather than a row nested in it. */
  whole: boolean;
  /** Which of the probed page regions the frame sits on. */
  hits: string[];
}

/**
 * Walks the tour from its first step to Done, one entry per step.
 *
 * Each entry reads what the overlay actually draws its frame around, not what steps.ts claims to
 * target. A step whose selector has drifted off its control - the fate of the old `info` step, which
 * pointed at an attribute no element carried - shows up here as a miss rather than passing on the
 * strength of being in the list.
 *
 * A tour is a dozen-odd steps, so the whole of a step is read in one call: a round trip per field
 * puts the longer tours past the test timeout when the suite runs its workers in parallel.
 */
async function walkTour(page: Page): Promise<TourFrame[]> {
  const next = page.getByRole("dialog", { name: "Guided tour", exact: true }).getByRole("button", { name: /^(Next|Done)$/ });
  const frames: TourFrame[] = [];
  // Generous, but bounded: a runaway tour should fail the assertions below, not hang the runner.
  for (let guard = 0; guard < 40; guard++) {
    frames.push(await readTourFrame(page));
    await next.click();
    if (frames.at(-1)!.last) return frames;
  }
  throw new Error(`the tour did not reach Done within 40 steps: ${frames.map(frame => frame.title).join(" → ")}`);
}

function readTourFrame(page: Page): Promise<TourFrame> {
  return page.evaluate(
    () =>
      new Promise<TourFrame>((resolve, reject) => {
        // The overlay sets the frame's rect inside a rAF, and reduced motion (set by every test that
        // walks the tour) turns off the transition that would otherwise animate it there. So the
        // frame after the one that paints the step is settled.
        let tries = 0;
        const read = () => {
          const highlight = document.querySelector(".tour-highlight");
          const tooltip = document.querySelector(".tour-tooltip");
          if (!highlight || !tooltip) {
            if (++tries > 120) return reject(new Error("no tour step appeared"));
            return requestAnimationFrame(read);
          }
          requestAnimationFrame(() => {
            const frame = highlight.getBoundingClientRect();
            const x = frame.left + frame.width / 2;
            const y = frame.top + frame.height / 2;
            const covers = (el: Element) => {
              const box = el.getBoundingClientRect();
              return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
            };
            const children = [...(document.querySelector(".shell-navigation .navigation-scroll")?.children ?? [])];
            const menuChild = children.findIndex(covers);
            const child = menuChild >= 0 ? children[menuChild] : null;
            resolve({
              title: tooltip.querySelector("h3")!.textContent!.trim(),
              last: [...tooltip.querySelectorAll("button")].some(button => button.textContent?.trim() === "Done"),
              menuChild,
              menuText: child?.textContent?.trim() ?? null,
              // The overlay grows the target's rect by 6 pixels on every side, so a frame is "whole"
              // when it matches the child's own height rather than that of a row inside it.
              whole: !!child && Math.abs(child.getBoundingClientRect().height - (frame.height - 12)) < 2,
              hits: Object.entries({ card: ".resource-card", labSteps: ".shell-navigation .steps" })
                .filter(([, selector]) => [...document.querySelectorAll(selector)].some(covers))
                .map(([name]) => name)
            });
          });
        };
        read();
      })
  );
}

test("Tour on a course home ends on a resource card", { tag: "@rule-0218" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(course);
  await startTour(page);
  const frames = await walkTour(page);
  expect(frames.at(-1)!.hits, frames.map(frame => frame.title).join(" → ")).toContain("card");
  expect(frames.flatMap(frame => frame.hits)).not.toContain("labSteps");
});

test("Tour on a lab ends on its step list", { tag: "@rule-0218" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(lab);
  await startTour(page);
  const frames = await walkTour(page);
  expect(frames.at(-1)!.hits, frames.map(frame => frame.title).join(" → ")).toContain("labSteps");
  expect(frames.flatMap(frame => frame.hits)).not.toContain("card");
});

test("Tour on a note offers neither cards nor lab steps", { tag: "@rule-0218" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/note/tutors-reference-manual/unit-1-getting-started/note-d-properties");
  const rows = await learnRows(page);
  await startTour(page);
  const frames = await walkTour(page);
  const detail = frames.map(frame => frame.title).join(" → ");
  expect(frames.flatMap(frame => frame.hits), detail).toEqual([]);
  // A page with neither cards nor steps still gets the menus; dropping the two page-specific steps
  // must not drop anything else with them.
  expect(rows.map(row => frames.some(frame => frame.menuChild === row.index)), detail).not.toContain(false);
});

test("Tour visits every Learn option in turn", { tag: "@rule-0219" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(course);
  // The course's own load can clear the role stores after the page first looks ready, so let it
  // finish before seeding: a role seeded into a half-loaded course gets wiped a moment later.
  await page.getByRole("heading", { name: "Reference Course", exact: true }).waitFor();
  // An educator sees the fullest Learn section there is, Educator Control included.
  await signInAs(page, "lecturer");
  const sidebar = page.locator(".shell-navigation");
  await expect(sidebar.getByRole("button", { name: "Open Educator Control", exact: true })).toBeVisible({ timeout: 15_000 });
  const rows = await learnRows(page);
  expect(rows.length).toBeGreaterThan(4);
  await startTour(page);
  const frames = await walkTour(page);
  const framed = frames.map(frame => frame.menuChild);
  const where = rows.map(row => framed.indexOf(row.index));
  const detail = `Learn ${JSON.stringify(rows.map(row => row.text))} against frames ${JSON.stringify(frames.map(frame => frame.title))}`;
  expect(where, detail).not.toContain(-1);
  // Walking the menu in the order it is read beats jumping around it.
  expect(where, detail).toEqual([...where].sort((a, b) => a - b));
});

test("Tour frames each further side menu section once", { tag: "@rule-0220" }, async ({ page }) => {
  // The viewport is set before seeding, which navigates: the sidebar is only in the page at this width.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Presence brings out the Activity section, so more than one section sits below Learn.
  await seedOneOnline(page);
  const sections = await page.locator(".shell-navigation .navigation-scroll").evaluate(scroll =>
    [...scroll.children].flatMap((el, index) => (el.matches(".tool-section") && el.getBoundingClientRect().height > 0 ? [{ index, text: el.textContent!.trim() }] : []))
  );
  expect(sections.length).toBeGreaterThan(1);
  await startTour(page);
  const frames = await walkTour(page);
  for (const section of sections) {
    const framing = frames.filter(frame => frame.menuChild === section.index);
    expect(framing.map(frame => frame.title), `section "${section.text}"`).toHaveLength(1);
    expect(framing[0].whole, `section "${section.text}" is framed whole`).toBe(true);
  }
});
