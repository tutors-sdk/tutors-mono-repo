import { expect, test } from "@playwright/test";
import { anonymousStudentReadsCourse } from "./journeys.ts";
import { stack } from "./stack.ts";

/**
 * Negative fixtures for tier G. Each test is declared `test.fail()`: it passes
 * only while the journey fails. If one starts passing, the run fails: either the
 * journeys lost their teeth, or a pinned product bug was fixed and its
 * expectation must move to the positive suite. Pin a newly found bug here the
 * same way, as a `KNOWN BUG:` test with the reason in `test.fail()`.
 */
test.describe("journeys can fail", () => {
  test("the course journey fails when tutors.json answers 500", async ({ page }) => {
    test.fail(true, "course-broken serves a 500 for tutors.json; the journey must not pass");
    const visited: string[] = [];
    await anonymousStudentReadsCourse(page, async (pageKey) => void visited.push(pageKey), stack.brokenCourseId);
    expect(visited).toContain("reader:lab-step");
  });
});
