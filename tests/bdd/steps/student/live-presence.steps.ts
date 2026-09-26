import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public env,
// SvelteKit and Auth.js. Everything between them is product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", async () => ({ env: (await import("../../support/supabase-recorder.ts")).publicEnv }));
vi.mock("$env/dynamic/private", async () => ({ env: (await import("../../support/supabase-recorder.ts")).privateEnv }));
// `$app/environment` and `$app/navigation` are aliased to one stub file, so one mock serves both.
vi.mock("$app/environment", () => ({ browser: true, goto: vi.fn() }));
vi.mock("@auth/sveltekit/client", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { ALL_COURSES_CHANNEL, freshBrowser, githubUser, labsOf, loEventArrives, openLo, publishedCourse, signIn } from "../../support/connect.ts";
import { recorder, settle } from "../../support/supabase-recorder.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { presenceService } from "../../../../packages/svelte/community/src/services/presence.svelte.ts";
import type { LoRecord } from "../../../../packages/svelte/community/src/types.svelte.ts";
import { tutorsConnectService } from "../../../../packages/svelte/connect/src/services/connect.svelte.ts";

const feature = await loadFeature("tests/bdd/features/student/live-presence.feature");

describeFeature(feature, ({ Background, Scenario }) => {
  let course: Course;

  const lab = (n: number) => labsOf(course)[n - 1];
  const online = () => presenceService.studentsOnline.value;
  const card = (name: string) => online().find((lo) => lo.user?.fullName === name);
  const names = () => online().map((lo) => lo.user?.fullName);
  /** Every lo-event this browser broadcast, on the course channel and the all-courses channel. */
  const broadcasts = () => [...recorder.sentOn(course.courseId), ...recorder.sentOn(ALL_COURSES_CHANNEL)].map((message) => message.payload as LoRecord);
  const opens = (_ctx: unknown, _name: string, n: number) => openLo(course, lab(n));

  Background(({ Given, And }) => {
    Given("the course {string} is published with {number} labs", (_ctx, courseId: string, labCount: number) => {
      freshBrowser();
      course = publishedCourse(courseId, labCount);
    });
    And("the student {string} is signed in", (_ctx, name: string) => signIn(githubUser(name)));
  });

  Scenario("See online students count", ({ Given, When, Then }) => {
    Given("{string} has opened lab {number} of the course", opens);
    When("{string} and {string} view lab {number} of the course", (_ctx, first: string, second: string, n: number) => {
      for (const name of [first, second]) loEventArrives(course.courseId, name, course, lab(n));
    });
    Then("the system shall display {number} students currently online", (_ctx, count: number) => {
      expect(online()).toHaveLength(count);
      expect(presenceService.listeningTo).toBe(course.courseId);
    });
  });

  Scenario("Receive real-time presence updates", ({ Given, When, Then, And }) => {
    Given("{string} has opened lab {number} of the course", opens);
    When("another student {string} joins the course at lab {number}", (_ctx, name: string, n: number) => {
      loEventArrives(course.courseId, name, course, lab(n));
    });
    Then("the system shall update the online count to {number}", (_ctx, count: number) => {
      expect(online()).toHaveLength(count);
    });
    And("the online list shall be {string}", (_ctx, list: string) => {
      expect(names()).toEqual(list.split(", "));
    });
    And("when {string} moves on to lab {number} the online count shall stay at {number} and show {string} at {string}", (_ctx, name: string, n: number, count: number, who: string, title: string) => {
      loEventArrives(course.courseId, name, course, lab(n));
      expect(online()).toHaveLength(count);
      expect(card(who)).toMatchObject({ title, loRoute: lab(n).route });
    });
  });

  Scenario("Express sentiment", ({ Given, When, Then, And }) => {
    Given("{string} has opened lab {number} of the course", opens);
    When("the student sets their sentiment to {string}", (_ctx, sentiment: string) => tutorsConnectService.updateSentiment(sentiment));
    And("the student moves on to lab {number}", (_ctx, n: number) => openLo(course, lab(n)));
    Then("the system shall store the sentiment {string} for {string}", (_ctx, sentiment: string, login: string) => {
      expect(recorder.rows("tutors-connect-users")).toMatchObject([{ github_id: login, sentiment }]);
    });
    And("the system shall broadcast the sentiment {string} to other course participants", (_ctx, sentiment: string) => {
      const afterChange = broadcasts().filter((payload) => payload.loRoute === lab(2).route);
      // Once on the course channel, once on the all-courses channel the live app listens to.
      expect(afterChange.map((payload) => payload.user?.sentiment)).toEqual([sentiment, sentiment]);
    });
    And("the sentiment {string} shall be on the presence card of {string}", (_ctx, sentiment: string, name: string) => {
      expect(card(name)?.user?.sentiment).toBe(sentiment);
    });
  });

  Scenario("Private mode hides presence", ({ Given, When, Then, And }) => {
    Given("the student has disabled share presence", async () => {
      tutorsConnectService.toggleShare();
      await settle();
    });
    When("{string} opens lab {number} of the course", opens);
    Then("the system shall mark {string} as {string}", (_ctx, login: string, status: string) => {
      expect(recorder.rows("tutors-connect-users")).toMatchObject([{ github_id: login, online_status: status }]);
    });
    And("the system shall not broadcast their activity to others", () => {
      expect(broadcasts()).toEqual([]);
      expect(recorder.rows("tutors-connect-latest")).toEqual([]);
    });
    And("their name shall not appear in the online list", () => {
      // The listener is up (the student still sees others); their own page view never reached it.
      expect(presenceService.listeningTo).toBe(course.courseId);
      expect(names()).toEqual([]);
    });
  });
});
