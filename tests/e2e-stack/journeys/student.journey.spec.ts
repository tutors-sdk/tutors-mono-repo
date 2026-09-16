import { expect, test } from "@playwright/test";
import { anonymousStudentReadsCourse, anonymousStudentSearches, catalogueLoads, liveLoads } from "./journeys.ts";
import { auditAccessibility, auditReducedMotion, collectPageErrors, fixture, stack } from "./stack.ts";

/**
 * Runway tier G against the built images. Every page a journey reaches is
 * audited with axe (serious and critical violations ratcheted against
 * a11y-known-violations.txt) and, on the reader, checked for motion under
 * prefers-reduced-motion.
 */
test.describe("anonymous student", () => {
  test("reads a course: home, course, topic, lab, next step", async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    const visited: string[] = [];
    await anonymousStudentReadsCourse(page, async (pageKey) => {
      visited.push(pageKey);
      await auditAccessibility(page, pageKey, testInfo);
      await auditReducedMotion(page, pageKey, testInfo);
    });
    expect(visited).toEqual(["reader:home", "reader:course", "reader:topic", "reader:lab-step"]);
    expect(errors, "uncaught errors in the page").toEqual([]);
  });

  test("searches a course and sees a result", async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    const visited: string[] = [];
    await anonymousStudentSearches(page, async (pageKey) => {
      visited.push(pageKey);
      await auditAccessibility(page, pageKey, testInfo);
    });
    expect(visited).toEqual(["reader:search", "reader:search-results"]);
    expect(errors, "uncaught errors in the page").toEqual([]);
  });

  test("opening search puts keyboard focus in the search box", async ({ page }) => {
    // The search page places focus itself; the layout's route-change focus must not take it back.
    await page.goto(`${stack.reader}/course/${stack.courseId}`);
    await page.getByRole("button", { name: "Search this course" }).click();
    await expect(page.getByRole("textbox", { name: "Enter search term:" })).toBeFocused({ timeout: 5_000 });
  });

  test("following a link elsewhere moves keyboard focus to the main content", async ({ page }) => {
    await page.goto(`${stack.reader}/course/${stack.courseId}`);
    await page.getByRole("main").getByRole("link", { name: new RegExp(`^${fixture.topicTitle}\\b`) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/topic/${stack.courseId}/${fixture.topicPath}$`));
    await expect(page.getByRole("main")).toBeFocused({ timeout: 5_000 });
  });
});

test.describe("other apps in anonymous mode", () => {
  test("catalogue renders its listing", async ({ page }, testInfo) => {
    const visited: string[] = [];
    await catalogueLoads(page, async (pageKey) => {
      visited.push(pageKey);
      await auditAccessibility(page, pageKey, testInfo);
    });
    expect(visited).toEqual(["catalogue:home"]);
  });

  test("live renders its tabs", async ({ page }, testInfo) => {
    const visited: string[] = [];
    await liveLoads(page, async (pageKey) => {
      visited.push(pageKey);
      await auditAccessibility(page, pageKey, testInfo);
    });
    expect(visited).toEqual(["live:home"]);
  });
});
