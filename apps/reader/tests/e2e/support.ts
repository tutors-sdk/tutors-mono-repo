import type { Page } from "@playwright/test";

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
 */
export async function seedOneOnline(page: Page): Promise<void> {
  const modules: string[] = [];
  page.on("request", request => modules.push(request.url()));
  await page.goto(course);
  await page.getByRole("heading", { name: "Reference Course", exact: true }).waitFor();
  // Opening Preferences loads the presence module, so its URL is known before seeding.
  await page.getByRole("button", { name: "Open Theme Menu", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.evaluate(async (urls) => {
    const { tutorsId } = await import(urls.find(url => url.includes("/runes/src/index.svelte.ts"))!);
    const { presenceService } = await import(urls.find(url => url.includes("/community/src/services/presence.svelte.ts"))!);
    tutorsId.value = { login: "ui-preview", name: "UI Preview", share: "true", sentiment: "neutral" };
    presenceService.studentsOnline.value = [{ title: "Objectives", type: "lab", loRoute: "/lab/reference-course/topic-01-typical/unit-1/book-a", courseTitle: "Reference Course", user: { id: "ui-preview", fullName: "UI Preview", sentiment: "neutral" } }];
  }, modules);
}

/**
 * Signs this browser in as a student or a lecturer, and optionally locks routes, by seeding the UI stores the
 * dev server has loaded. Locks save only to this browser (no Supabase in dev or CI); nothing is written anywhere.
 */
export async function signInAs(page: Page, role: "student" | "lecturer", locked: string[] = []): Promise<void> {
  await page.evaluate(async ({ role, locked }) => {
    const runes = performance.getEntriesByType("resource").map(entry => entry.name).find(url => url.includes("/runes/src/index.svelte.ts"))!;
    const { tutorsId, isEducator, contentLocks, locksLoaded } = await import(runes);
    tutorsId.value = { login: `ui-${role}`, name: `UI ${role}`, share: "false", sentiment: "neutral" };
    isEducator.value = role === "lecturer";
    if (locked.length) contentLocks.value = new Map(locked.map(route => [route, true]));
    locksLoaded.value = true;
  }, { role, locked });
}
