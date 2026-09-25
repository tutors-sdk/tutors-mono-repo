import { expect, type Page } from "@playwright/test";

export const course = "/course/reference-course";
export const lab = "/lab/reference-course/topic-01-typical/unit-1/book-a";

/** True when neither the page nor the main content scrolls sideways. */
export async function fitsViewport(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const main = document.querySelector("#main-content");
    return document.documentElement.scrollWidth <= innerWidth && (!main || main.scrollWidth <= main.clientWidth + 1);
  });
}

/**
 * Signs this browser in as "UI Preview" with one student online, by seeding the UI stores the dev
 * server has already loaded. No sign-in or presence writes are made.
 * `educator` seeds the same reader as an educator of the course, which is what the activity group's
 * class activity link is gated on.
 */
export async function seedOneOnline(page: Page, { educator = false } = {}): Promise<void> {
  // The presence module is fetched as a preload, which leaves no "resource" timing entry in every
  // browser, so its URL is taken from the requests the page makes rather than from performance.
  const modules: string[] = [];
  page.on("request", request => modules.push(request.url()));
  await page.goto(course);
  await page.getByRole("heading", { name: "Reference Course", exact: true }).waitFor();
  // Opening Preferences loads the presence module, so its URL is known before seeding.
  await page.getByRole("button", { name: "Open Theme Menu", exact: true }).click();
  await page.keyboard.press("Escape");
  // The course visit can reset these stores after the page looks ready (rbacService.clear() on a slow
  // runner), so seed, wait a moment, and seed again until the identity holds.
  await expect(async () => {
    const held = await page.evaluate(async ({ urls, educator }) => {
      const { tutorsId, isEducator } = await import(urls.find(url => url.includes("/runes/src/index.svelte.ts"))!);
      const { presenceService } = await import(urls.find(url => url.includes("/community/src/services/presence.svelte.ts"))!);
      tutorsId.value = { login: "ui-preview", name: "UI Preview", share: "true", sentiment: "neutral" };
      isEducator.value = educator;
      presenceService.studentsOnline.value = [{ title: "Objectives", type: "lab", loRoute: "/lab/reference-course/topic-01-typical/unit-1/book-a", courseTitle: "Reference Course", user: { id: "ui-preview", fullName: "UI Preview", sentiment: "neutral" } }];
      await new Promise(resolve => setTimeout(resolve, 750));
      return tutorsId.value?.share === "true" && isEducator.value === educator && presenceService.studentsOnline.value.length === 1;
    }, { urls: modules, educator });
    expect(held).toBe(true);
  }).toPass({ timeout: 20_000 });
}

/**
 * Signs this browser in as a student or a lecturer, and optionally locks routes, by seeding the UI stores the
 * dev server has loaded. Locks save only to this browser (no Supabase in dev or CI); nothing is written anywhere.
 */
export async function signInAs(page: Page, role: "student" | "lecturer", locked: string[] = []): Promise<void> {
  // The course visit can reset these stores after the page looks ready (rbacService.clear() on a slow
  // runner), so seed, wait a moment, and seed again until the role holds.
  await expect(async () => {
    const held = await page.evaluate(async ({ role, locked }) => {
      const runes = performance.getEntriesByType("resource").map(entry => entry.name).find(url => url.includes("/runes/src/index.svelte.ts"))!;
      const { tutorsId, isEducator, contentLocks, locksLoaded } = await import(runes);
      tutorsId.value = { login: `ui-${role}`, name: `UI ${role}`, share: "false", sentiment: "neutral" };
      isEducator.value = role === "lecturer";
      if (locked.length) contentLocks.value = new Map(locked.map(route => [route, true]));
      locksLoaded.value = true;
      await new Promise(resolve => setTimeout(resolve, 750));
      return isEducator.value === (role === "lecturer") && tutorsId.value?.login === `ui-${role}`;
    }, { role, locked });
    expect(held).toBe(true);
  }).toPass({ timeout: 20_000 });
}

/**
 * Locks routes on the loaded course the way the reader stores them without Supabase (localStorage, keyed by
 * course), marks the course as enrolled (locks only apply to enrolled courses) and reloads the locks.
 * `showLocked` turns on the lecturer's "show locked content to students" setting. Nothing leaves the browser.
 */
export async function seedEnrolledLocks(page: Page, locked: string[], showLocked = false): Promise<void> {
  await page.evaluate(async ({ locked, showLocked }) => {
    const modules = performance.getEntriesByType("resource").map(entry => entry.name);
    const { currentCourse } = await import(modules.find(url => url.includes("/runes/src/index.svelte.ts"))!);
    const { rbacService, SHOW_LOCKED_KEY } = await import(modules.find(url => url.includes("/rbac/src/rbac-service.svelte.ts"))!);
    const course = currentCourse.value;
    const entries = Object.fromEntries(locked.map(route => [route, true]));
    if (showLocked) entries[SHOW_LOCKED_KEY] = true;
    localStorage.setItem(`tutors-locks-${course.courseId}`, JSON.stringify(entries));
    course.hasEnrollment = true;
    await rbacService.loadContentLocks(course.courseId);
  }, { locked, showLocked });
}
