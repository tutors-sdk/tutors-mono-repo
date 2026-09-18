import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public env,
// SvelteKit and Auth.js. Everything between them is product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", async () => ({ env: (await import("../../support/supabase-recorder.ts")).publicEnv }));
// `$app/environment` and `$app/navigation` are aliased to one stub file, so one mock serves both.
vi.mock("$app/environment", () => ({ browser: true, goto: vi.fn() }));
vi.mock("@auth/sveltekit/client", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { goto } from "$app/navigation";
import { freshBrowser, githubUser, labsOf, openLo, publishedCourse, signIn } from "../../support/connect.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";

const feature = await loadFeature("tests/bdd/features/instructor/whitelist-management.feature");

const list = (csv: string) => csv.split(",").map((item) => item.trim());

describeFeature(feature, ({ Scenario }) => {
  let course: Course;

  // `auth: 1` in properties.yaml is what makes the reader demand a sign-in; the whitelist comes from enrollment.yaml.
  const restrictedCourse = (_ctx: unknown, courseId: string, whitelist: string, educators: string) => {
    freshBrowser();
    course = publishedCourse(courseId, 1, { auth: 1 }, { whitelist: list(whitelist), educators: list(educators), students: [] });
  };
  const signedIn = (_ctx: unknown, name: string) => signIn(githubUser(name));
  const openCourse = () => openLo(course, labsOf(course)[0]);
  const granted = () => expect(goto).not.toHaveBeenCalled();

  Scenario("Private course requires authentication", ({ Given, And, When, Then }) => {
    Given("the course {string} requires authentication", (_ctx, courseId: string) => {
      freshBrowser();
      course = publishedCourse(courseId, 1, { auth: 1 });
    });
    And("nobody is signed in", () => {});
    When("the course is opened", openCourse);
    Then("the system shall require authentication before displaying content, remembering {string} for after sign-in", (_ctx, courseId: string) => {
      expect(localStorage.loginCourse).toBe(courseId);
    });
    And("unauthenticated users shall be redirected to the sign-in page {string}", (_ctx, path: string) => {
      expect(vi.mocked(goto).mock.calls).toEqual([[path]]);
    });
  });

  Scenario("Whitelisted student can access private course", ({ Given, And, When, Then }) => {
    Given("the course {string} requires authentication, with the whitelist {string} and the educators {string}", restrictedCourse);
    And("{string} is signed in", signedIn);
    When("the course is opened", openCourse);
    Then("the system shall grant access to the course content", granted);
  });

  Scenario("Non-whitelisted student denied access", ({ Given, And, When, Then }) => {
    Given("the course {string} requires authentication, with the whitelist {string} and the educators {string}", restrictedCourse);
    And("{string} is signed in", signedIn);
    When("the course is opened", openCourse);
    Then("the system shall deny access to the course content by sending the student to {string}", (_ctx, path: string) => {
      expect(vi.mocked(goto).mock.calls).toEqual([[path]]);
    });
  });

  Scenario("Instructor always has access to their courses", ({ Given, And, When, Then }) => {
    Given("the course {string} requires authentication, with the whitelist {string} and the educators {string}", restrictedCourse);
    And("{string} is signed in", signedIn);
    When("the course is opened", openCourse);
    Then("the system shall grant access regardless of whitelist status", granted);
  });
});
