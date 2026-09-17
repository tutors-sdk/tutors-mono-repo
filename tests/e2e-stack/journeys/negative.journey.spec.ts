import { expect, test } from "@playwright/test";
import { anonymousStudentReadsCourse } from "./journeys.ts";
import { stack } from "./stack.ts";

/**
 * Negative fixtures for tier G. Each test is declared `test.fail()`: it passes
 * only while the journey fails. If one of these starts passing, the run fails,
 * which means either the journeys lost their teeth (first test) or a known
 * product bug was fixed and the expectation must move to the positive suite
 * (second test).
 */
test.describe("journeys can fail", () => {
  test("the course journey fails when tutors.json answers 500", async ({ page }) => {
    test.fail(true, "course-broken serves a 500 for tutors.json; the journey must not pass");
    const visited: string[] = [];
    await anonymousStudentReadsCourse(page, async (pageKey) => void visited.push(pageKey), stack.brokenCourseId);
    expect(visited).toContain("reader:lab-step");
  });

  test("KNOWN BUG: opening search puts keyboard focus in the search box", async ({ page }) => {
    // The search page focuses its input in onMount, then the layout's
    // route-change focus handling moves focus to <main id="main-content">.
    test.fail(true, "focus lands on #main-content, not the search input");
    await page.goto(`${stack.reader}/course/${stack.courseId}`);
    await page.getByRole("button", { name: "Search this course" }).click();
    await expect(page.getByRole("textbox", { name: "Enter search term:" })).toBeFocused({ timeout: 5_000 });
  });
});
