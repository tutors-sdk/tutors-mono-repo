import { expect, test, type Browser } from "@playwright/test";
import { fixture } from "./stack.ts";
import { VISIBLE, contextFor, identityFault, labStepHeading, persistence, signInToCourse, signedIn, startSignIn } from "./signed-in.ts";

/**
 * The resilience journeys: tests/bdd/features/journeys/resilience.feature, one test per scenario. Each injects one
 * fault where production would meet it and holds the reader to the outcome its Rule names, within a time bound, so a
 * dependency that stalls cannot turn into a page that never loads without failing the pull request. They run in the
 * `signed-in` project, one at a time, and leave every fault off for the next journey.
 */
test.beforeEach(async () => {
  await persistence.reset();
});

test.afterEach(async () => {
  await persistence.reset();
  await identityFault("off");
});

test("A course whose host never answers shows Course Unavailable (exercises Rule 0011)", { tag: "@rule-0614" }, async ({ page }) => {
  await page.goto(`${signedIn.reader}/course/${signedIn.stalledCourseId}`);
  const error = page.getByRole("alert");
  // The reader gives up on the host after 15 seconds (COURSE_FETCH_TIMEOUT_MS); 25 leaves room for the page itself.
  await expect(error.getByRole("heading", { name: "Course Unavailable" })).toBeVisible({ timeout: 25_000 });
  await expect(error.getByRole("heading", { name: "504" })).toBeVisible();
});

/** Signed in, then the data API fails, then the student opens Lab 1: the page that should still show. */
async function openLabWhileDataApi(browser: Browser, mode: "down" | "hang") {
  const page = await (await contextFor(browser, "student")).newPage();
  await signInToCourse(page, signedIn.publicCourseId, fixture.title);
  await persistence.fault(mode);
  await page.goto(`${signedIn.reader}/lab/${signedIn.publicCourseId}/${fixture.labPath}`);
  return page;
}

test("A signed-in student reads a lab while the data API answers 503 (exercises Rules 0606, 0607)", { tag: "@rule-0615" }, async ({ browser }) => {
  const page = await openLabWhileDataApi(browser, "down");
  await expect(labStepHeading(page, fixture.firstStep.heading)).toBeVisible(VISIBLE);
  await page.context().close();
});

test("A signed-in student reads a lab while the data API never answers (exercises Rules 0606, 0607)", { tag: "@rule-0615" }, async ({ browser }) => {
  const page = await openLabWhileDataApi(browser, "hang");
  await expect(labStepHeading(page, fixture.firstStep.heading)).toBeVisible(VISIBLE);
  await page.context().close();
});

test("The readiness check answers in time while the data API never answers (exercises Rule 0573)", { tag: "@rule-0616" }, async ({ request }) => {
  await persistence.fault("hang");
  const started = Date.now();
  const response = await request.get(`${signedIn.reader}/healthz`, { timeout: 10_000 });
  const elapsed = Date.now() - started;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "degraded", checks: { supabase: { status: "error" } } });
  expect(elapsed, "the readiness probe's own timeout is 3 seconds (deploy/k8s/base/deployment.yaml)").toBeLessThan(3_000);
});

test("GitHub failing the sign-in leaves the student on the sign-in page with a message", { tag: "@rule-0617" }, async ({ browser }) => {
  await identityFault("down");
  const context = await contextFor(browser, "student");
  const page = await context.newPage();
  await startSignIn(page, signedIn.publicCourseId);
  await page.waitForURL((url) => url.pathname.startsWith("/auth") && url.searchParams.has("error"), { timeout: 30_000 });
  await expect(page.getByRole("alert").filter({ hasText: "Signing in with GitHub did not finish. Try again in a few minutes." })).toBeVisible(VISIBLE);
  await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeEnabled();
  await context.close();
});
