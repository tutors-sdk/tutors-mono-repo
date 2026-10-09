import { expect, test, type Page } from "@playwright/test";
import { course, lab, signInAs } from "./support";
import { githubCallback, isSessionCookie } from "../../../../tests/bdd/support/reader-oauth.mjs";

const protectedUrl = "http://localhost:5178/protected";

async function expectStudent(page: Page): Promise<void> {
  const response = await page.request.get(protectedUrl);
  expect(response.status()).toBe(200);
  expect((await response.json()).actor).toMatchObject({ subject: "github:1001", login: "student" });
  await expect(page.getByRole("button", { name: "Profile menu", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Student", exact: true })).toBeVisible();
}

test("The sign-in button completes OAuth through the production identity client", async ({ page }) => {
  await page.route("https://github.com/login/oauth/authorize?**", route =>
    route.fulfill({ status: 302, headers: { location: githubCallback(route.request().url(), "student").href }, body: "" })
  );
  await page.goto("/auth/reference-course");
  await page.getByRole("button", { name: /Sign in with GitHub/i }).click();
  await page.waitForURL(course);
  await expectStudent(page);
});

test("Signed identity survives navigation and reload, and logout clears it", async ({ page }) => {
  await page.goto(course);
  await signInAs(page, "student");
  await expectStudent(page);
  await page.locator(".resource-card").filter({ has: page.getByRole("heading", { name: "Simple", exact: true }) }).locator(".resource-link").click();
  await page.waitForURL(/\/topic\/reference-course\//);
  await expectStudent(page);
  await page.goto(lab);
  await page.reload();
  await expectStudent(page);
  await page.getByRole("button", { name: "Profile menu", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("img", { name: "Student", exact: true })).toHaveCount(0);
  expect((await page.request.get(protectedUrl)).status()).toBe(401);
  expect((await page.context().cookies()).some(cookie => isSessionCookie(cookie.name))).toBe(false);
  await page.reload();
  expect((await page.request.get(protectedUrl)).status()).toBe(401);
});

test("Forged browser identity and a forged cookie cannot authorize a server request", async ({ page }) => {
  await page.goto(course);
  await page.locator(".shell-navigation").getByRole("link", { name: "Course home", exact: true }).waitFor({ state: "attached" });
  await page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").map(entry => entry.name).find(url => url.includes("/runes/src/index.svelte.ts"))!;
    const { tutorsId, isEducator } = await import(url);
    tutorsId.value = { login: "lecturer", name: "Lecturer", share: "false", sentiment: "neutral" };
    isEducator.value = true;
  });
  await expect(page.getByRole("img", { name: "Lecturer", exact: true })).toBeVisible();
  expect((await page.request.get(protectedUrl)).status()).toBe(401);
  await page.context().addCookies([{ name: "better-auth.session_data", value: "forged", url: "http://localhost:5173", httpOnly: true, sameSite: "Lax" }]);
  expect((await page.request.get(protectedUrl)).status()).toBe(401);
});

test("A production configuration rejects cookies issued with the fixture secret", async ({ page }) => {
  await page.goto(course);
  await signInAs(page, "student");
  await expectStudent(page);
  expect((await page.request.get("http://localhost:5179/protected")).status()).toBe(401);
});
