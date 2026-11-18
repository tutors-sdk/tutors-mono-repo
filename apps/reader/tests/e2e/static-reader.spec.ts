import { test, expect, type Page } from "@playwright/test";

// Proves tests/bdd/features/ui/static-reader.feature. Runs only under playwright.static.config.ts, over a real
// static build (the default config ignores this file: its dev server is not a static build).

const COURSE_HOST = "127.0.0.1:8190";
const SERVER_ROUTES = /^\/(api\/|healthz|version$|metrics$)|__data\.json$/;

/** Every request the page makes to the reader's own origin for a route only a server could answer. */
function serverRouteRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.port === "5190" && SERVER_ROUTES.test(url.pathname)) seen.push(`${request.method()} ${url.pathname}`);
  });
  return seen;
}

test("A course and a topic open with no request to a server route", { tag: "@rule-0773" }, async ({ page }) => {
  const seen = serverRouteRequests(page);
  await page.goto(`/course/${COURSE_HOST}`);
  await expect(page.getByRole("heading", { name: /Cúrsa Tagartha/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /Typical Topic/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/topic/${COURSE_HOST}/topic-01-typical`));
  await expect(page.getByText("Typical Topic").first()).toBeVisible();
  expect(seen).toEqual([]);
});

test("A topic opened straight from its address is answered by the fallback page", { tag: "@rule-0773" }, async ({ page }) => {
  const seen = serverRouteRequests(page);
  await page.goto(`/topic/${COURSE_HOST}/topic-02-side`);
  await expect(page.getByText("Side Topic").first()).toBeVisible();
  expect(seen).toEqual([]);
});
