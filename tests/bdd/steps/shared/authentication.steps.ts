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
// Auth.js is mocked by the path the connect package resolves, so the step can read what the reader asked of it.
const authSignIn = vi.hoisted(() => vi.fn());
vi.mock("../../../../packages/svelte/connect/node_modules/@auth/sveltekit/dist/client.js", () => ({ signIn: authSignIn, signOut: vi.fn() }));

import { goto } from "$app/navigation";
import { ALL_COURSES_CHANNEL, freshBrowser, githubUser, labsOf, openLo, publishedCourse, signIn } from "../../support/connect.ts";
import { recorder } from "../../support/supabase-recorder.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { tutorsConnectService } from "../../../../packages/svelte/connect/src/services/connect.svelte.ts";
import { tutorsId } from "../../../../packages/svelte/runes/src/index.svelte.ts";

const feature = await loadFeature("tests/bdd/features/shared/authentication.feature");

describeFeature(feature, ({ Background, Rule }) => {
  let course: Course;

  const lab = () => labsOf(course)[0];
  const notAuthenticated = () => expect(tutorsId.value).toBeNull();
  const navigateToLab = (_ctx: unknown, courseId: string) => {
    expect(course.courseId).toBe(courseId);
    return openLo(course, lab());
  };
  const activityNotRecorded = () => {
    expect(recorder.rows("learning_records")).toEqual([]);
    expect(recorder.rows("calendar")).toEqual([]);
    expect(recorder.rows("tutors-connect-latest")).toEqual([]);
    expect([...recorder.sentOn(course.courseId), ...recorder.sentOn(ALL_COURSES_CHANNEL)]).toEqual([]);
  };

  Background(({ Given }) => {
    Given("the course {string} is published with {number} labs", (_ctx, courseId: string, labCount: number) => {
      freshBrowser();
      course = publishedCourse(courseId, labCount);
    });
  });

  Rule(
    "When a student chooses to sign in from a course, the reader shall start the GitHub sign-in flow, return the student to that course and save the student's record.",
    ({ RuleScenario }) => {
      RuleScenario("Sign in with GitHub OAuth", ({ Given, When, Then, And }) => {
        Given("I am not authenticated", notAuthenticated);
        When("I choose to sign in from {string}", (_ctx, path: string) => tutorsConnectService.connect(path));
        Then("the reader should start the {string} sign-in flow, returning to {string}", (_ctx, provider: string, path: string) => {
          expect(authSignIn.mock.calls).toEqual([[provider, { callbackUrl: path }]]);
        });
        // Auth.js owns the GitHub round trip; the reader takes over again when the session arrives.
        And("after authentication as {string} the reader should know me by my profile name {string}", async (_ctx, user: string, name: string) => {
          await signIn(githubUser(user));
          expect(tutorsId.value?.name).toBe(name);
        });
        And("my student record should be saved as {string} with the name {string}", (_ctx, login: string, name: string) => {
          expect(recorder.rows("tutors-connect-users")).toMatchObject([{ github_id: login, full_name: name, avatar_url: githubUser(name).image }]);
        });
      });
    }
  );

  Rule("While a student is signed in, the reader shall record the student's lab visits in the analytics service.", ({ RuleScenario }) => {
    RuleScenario("Track authenticated user activity", ({ Given, When, Then, And }) => {
      Given("I am authenticated as {string}", (_ctx, name: string) => signIn(githubUser(name)));
      When("I navigate to a lab in {string}", navigateToLab);
      Then("my activity should be recorded to the analytics service", () => {
        expect(recorder.upserts("learning_records")).toHaveLength(1);
        expect(recorder.upserts("calendar")).toHaveLength(1);
      });
      And("the record should include my user ID {string} and the lab route", (_ctx, login: string) => {
        expect(recorder.upserts("learning_records")[0]).toMatchObject({ course_id: course.courseId, student_id: login, lo_id: lab().route, type: "lab", count: 1 });
        expect(recorder.upserts("calendar")[0]).toMatchObject({ studentid: login, courseid: course.courseId, pageloads: 1 });
      });
    });

    RuleScenario("Anonymous browsing records no activity", ({ Given, When, Then }) => {
      Given("I am not authenticated", notAuthenticated);
      When("I navigate to a lab in {string}", navigateToLab);
      Then("my activity should not be recorded", activityNotRecorded);
    });
  });

  Rule("The reader shall show course content without requiring a student to sign in.", ({ RuleScenario }) => {
    RuleScenario("Anonymous browsing", ({ Given, When, Then }) => {
      Given("I am not authenticated", notAuthenticated);
      When("I navigate to a lab in {string}", navigateToLab);
      Then("I should be able to view course content without being sent to sign in", () => {
        expect(goto).not.toHaveBeenCalled();
      });
    });
  });
});
