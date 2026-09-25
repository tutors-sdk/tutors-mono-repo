import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public env,
// SvelteKit and Auth.js. Everything between them is product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", async () => ({ env: (await import("../../support/supabase-recorder.ts")).publicEnv }));
// The reader's /api routes, which the browser code now saves through, read the service_role key from here.
vi.mock("$env/dynamic/private", async () => ({ env: (await import("../../support/supabase-recorder.ts")).privateEnv }));
// `$app/environment` and `$app/navigation` are aliased to one stub file, so one mock serves both.
vi.mock("$app/environment", () => ({ browser: true, goto: vi.fn() }));
vi.mock("@auth/sveltekit/client", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { freshBrowser, labsOf, loEventArrives, publishedCourse, studentOpensLab } from "../../support/connect.ts";
import { liveService } from "../../../../packages/svelte/community/src/services/live.svelte.ts";
import { presenceService } from "../../../../packages/svelte/community/src/services/presence.svelte.ts";

const feature = await loadFeature("tests/bdd/features/live/presence-tracking.feature");

const list = (csv: string) => csv.split(",").map((item) => item.trim());

describeFeature(feature, ({ Scenario }) => {
  Scenario("Display courses with active students", ({ Given, When, Then, And }) => {
    // The home page of the live app: one listener on the channel every reader broadcasts to.
    Given("I am viewing the live dashboard", () => {
      freshBrowser();
      liveService.startGlobalPresenceService();
    });
    // Each student signs in to the reader and opens a lab; what reaches the dashboard is the reader's own broadcast.
    When("{number} students come online across the courses {string}", async (_ctx, count: number, courseIds: string) => {
      const courses = list(courseIds).map((courseId) => publishedCourse(courseId));
      for (let i = 0; i < count; i++) await studentOpensLab(`Student ${i + 1}`, courses[i % courses.length]);
    });
    Then("I should see {number} course cards, for {string}", (_ctx, count: number, courseIds: string) => {
      expect(liveService.coursesOnline.value).toHaveLength(count);
      expect(liveService.coursesOnline.value.map((lo) => lo.courseId)).toEqual(list(courseIds));
    });
    And("the dashboard should count {number} active students", (_ctx, count: number) => {
      expect(liveService.studentsOnline.value.map((lo) => lo.user?.fullName)).toEqual(Array.from({ length: count }, (_, i) => `Student ${i + 1}`));
    });
  });

  Scenario("Display individual student on a course", ({ Given, When, Then, And }) => {
    const course = publishedCourse("web-dev-101");
    // The course page of the live app listens through the presence service, on the channel of that course.
    Given("I am viewing the course detail for {string}", (_ctx, courseId: string) => {
      freshBrowser();
      presenceService.startPresenceListener(courseId);
    });
    When("a student {string} becomes active on {string}", (_ctx, name: string, courseId: string) => {
      loEventArrives(courseId, name, course, labsOf(course)[0]);
    });
    Then("I should see {string} in the active students list", (_ctx, name: string) => {
      expect(presenceService.studentsOnline.value.map((lo) => lo.user?.fullName)).toEqual([name]);
    });
    And("I should see their avatar {string}", (_ctx, avatar: string) => {
      expect(presenceService.studentsOnline.value[0].user?.avatar).toBe(avatar);
    });
  });
});
