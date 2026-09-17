import { expect, test } from "@playwright/test";
import { anonymousStudentReadsCourse, anonymousStudentSearches, catalogueLoads, liveLoads } from "./journeys.ts";
import { auditAccessibility, auditReducedMotion, collectPageErrors } from "./stack.ts";

/**
 * Runway tier G against the built images. Every page a journey reaches is
 * audited with axe (serious and critical violations ratcheted against
 * a11y-known-violations.txt) and, on the reader, checked for motion under
 * prefers-reduced-motion.
 */
test.describe("anonymous student", () => {
  test("reads a course: home, course, topic, lab, next step, talk", async ({ page }, testInfo) => {
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
