import { expect, request, type Page } from "@playwright/test";

import { githubCallback, signInRequest, isSessionCookie } from "../../../../tests/bdd/support/reader-oauth.mjs";

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
 * Seeds a rendering/presence preview in the browser. This does not authenticate the browser
 * or prove access to a server route. No sign-in or presence writes are made.
 * `online: 0` renders the sharing preview with an empty course, which no live course reaches on demand.
 */
export async function seedOneOnline(page: Page, { online = 1 } = {}): Promise<void> {
  // The presence module is fetched as a preload, which leaves no "resource" timing entry in every
  // browser, so its URL is taken from the requests the page makes rather than from performance.
  const modules: string[] = [];
  page.on("request", request => modules.push(request.url()));
  await page.goto(course);
  await page.getByRole("heading", { name: "Reference Course", exact: true }).waitFor();
  // Opening Preferences loads the presence module, so its URL is known before seeding.
  await page.getByRole("button", { name: "Open Theme Menu", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "Preferences", exact: true });
  await expect.poll(() => preferences.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(preferences).not.toBeVisible();
  // The course visit can reset these stores after the page looks ready (rbacService.clear() on a slow
  // runner), so seed, wait a moment, and seed again until the identity holds.
  await expect(async () => {
    const held = await page.evaluate(async ({ urls, online }) => {
      const { tutorsId, isEducator } = await import(urls.find(url => url.includes("/runes/src/index.svelte.ts"))!);
      const { presenceService } = await import(urls.find(url => url.includes("/community/src/services/presence.svelte.ts"))!);
      tutorsId.value = { login: "ui-preview", name: "UI Preview", share: "true", sentiment: "neutral" };
      isEducator.value = false;
      presenceService.studentsOnline.value = Array.from({ length: online }, () => ({ title: "Objectives", type: "lab", loRoute: "/lab/reference-course/topic-01-typical/unit-1/book-a", courseTitle: "Reference Course", user: { id: "ui-preview", fullName: "UI Preview", sentiment: "neutral" } }));
      await new Promise(resolve => setTimeout(resolve, 750));
      return tutorsId.value?.share === "true" && isEducator.value === false && presenceService.studentsOnline.value.length === online;
    }, { urls: modules, online });
    expect(held).toBe(true);
  }).toPass({ timeout: 20_000 });
}

/** Obtains signed cookies through the reader's real OAuth routes, then hydrates its normal layout. */
export async function signInAs(page: Page, role: "student" | "lecturer"): Promise<void> {
  // Enrollment is course content, not a browser identity/role override.
  await page.route("https://reference-course.netlify.app/tutors.json", async route => {
    const response = await route.fetch();
    const content = await response.json();
    await route.fulfill({ response, json: { ...content, enrollment: { educators: ["lecturer"] } } });
  });
  const origin = new URL(page.url()).origin;
  const http = await request.newContext({ baseURL: origin });
  try {
    const start = signInRequest(page.url());
    const started = await http.post(start.path, {
      headers: { origin }, data: start.json
    });
    expect(started.ok()).toBe(true);
    const { url } = await started.json();
    const callback = githubCallback(url, role);
    const completed = await http.get(callback.href, { maxRedirects: 0 });
    expect(completed.status()).toBe(302);
    expect(completed.headers().location).toBe(page.url());
    const { cookies } = await http.storageState();
    expect(cookies.some(cookie => isSessionCookie(cookie.name))).toBe(true);
    await page.context().addCookies(cookies);
  } finally {
    await http.dispose();
  }
  await page.reload();
  await expect(page.getByRole("button", { name: "Profile menu", exact: true })).toBeVisible();
}

/**
 * Opens a notebook whose markdown cells carry no heading, which no published course has: the notebook is
 * read once to fill the course service's cache, its headings are stripped there, and it is opened again so
 * the cache hit renders the stripped copy. Nothing is written anywhere.
 */
export async function openNotebookWithoutHeadings(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.locator("#notebook-cell-0").waitFor();
  const stripped = await page.evaluate(async path => {
    const modules = performance.getEntriesByType("resource").map(entry => entry.name);
    const { courseService } = await import(modules.find(url => url.includes("/course/src/course/services/course.svelte.ts"))!);
    const notebook = courseService.notebooks.get(path);
    if (!notebook) return 0;
    let count = 0;
    for (const cell of notebook.cells) {
      if (cell.cellType !== "markdown") continue;
      cell.source = cell.source.replace(/^#+[ \t]*/, "");
      count += 1;
    }
    // The outline is derived once, when the notebook is first read, so the cached copy is dropped and
    // built again from the stripped cells on the way back in.
    courseService.notebooks.delete(path);
    return count;
  }, path);
  expect(stripped).toBeGreaterThan(0);
  // Stepping out and back through the app remounts the page against the stripped cells; a reload would
  // discard them along with the rest of the module state.
  await page.locator(".shell-navigation").getByRole("link", { name: /^←/ }).click();
  // Wait for the step out to land: going back before it does lands back where we started.
  await page.waitForURL(/\/topic\//);
  await page.goBack();
  await page.waitForURL(path);
  await page.locator("#notebook-cell-0").waitFor();
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
