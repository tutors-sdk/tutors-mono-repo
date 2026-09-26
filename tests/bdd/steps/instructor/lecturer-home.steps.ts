import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the environment,
// SvelteKit and Auth.js. The home page's service, the data API client and the reader's /api/home route and its authorization module are product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", async () => ({ env: (await import("../../support/supabase-recorder.ts")).publicEnv }));
vi.mock("$env/dynamic/private", async () => ({ env: (await import("../../support/supabase-recorder.ts")).privateEnv }));
vi.mock("$app/environment", () => ({ browser: true, building: false, goto: vi.fn() }));
vi.mock("@auth/sveltekit/client", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { freshBrowser, githubUser, publishedCourse, signIn } from "../../support/connect.ts";
import { recorder } from "../../support/supabase-recorder.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { loadHome, teachingVisits, type HomeView } from "../../../../packages/svelte/connect/src/services/home.ts";
import { tutorsId } from "../../../../packages/svelte/runes/src/index.svelte.ts";

const feature = await loadFeature("tests/bdd/features/instructor/lecturer-home.feature");

describeFeature(feature, ({ Background, Rule }) => {
  const courses = new Map<string, Course>();
  let home: HomeView;

  function visit(courseId: string, hours: number) {
    return { id: courseId, title: courses.get(courseId)!.title, lastVisit: new Date(Date.now() - hours * 3_600_000).toISOString(), credits: "", visits: 1 };
  }
  const signedInHaving = async (_ctx: unknown, name: string, first: string, second: string) => {
    const user = githubUser(name);
    recorder.seed("tutors-connect-profiles", [{ tutorId: user.login, profile: [visit(first, 1), visit(second, 2)] }]);
    await signIn(user);
  };
  const loadsFor = async (_ctx: unknown, name: string) => {
    expect(tutorsId.value?.login).toBe(githubUser(name).login);
    home = await loadHome();
  };
  const teaching = () => teachingVisits(home.progress, home.visits).map((v) => v.id);

  Background(({ Given, And }) => {
    Given("the course {string} is published with {string} as its educator", (_ctx, courseId: string, educator: string) => {
      freshBrowser();
      courses.clear();
      courses.set(courseId, publishedCourse(courseId, 2, {}, { educators: [educator], whitelist: [], students: [] }));
    });
    And("the course {string} is published with {string} as its educator", (_ctx, courseId: string, educator: string) => {
      courses.set(courseId, publishedCourse(courseId, 2, {}, { educators: [educator], whitelist: [], students: [] }));
    });
  });

  Rule("While a signed-in user is an educator of a course in their profile, the reader shall list that course under Teaching on the home page.", ({ RuleScenario }) => {
    RuleScenario("A lecturer sees the course they teach under Teaching", ({ Given, When, Then }) => {
      Given("{string} is signed in and has opened {string} and {string}", signedInHaving);
      When("the home page loads for {string}", loadsFor);
      Then("Teaching lists {string} and not {string}", (_ctx, taught: string, other: string) => {
        expect(teaching()).toEqual([taught]);
        expect(home.visits.map((v) => v.id)).toContain(other);
      });
    });

    RuleScenario("A student sees no Teaching", ({ Given, When, Then }) => {
      Given("{string} is signed in and has opened {string} and {string}", signedInHaving);
      When("the home page loads for {string}", loadsFor);
      Then("Teaching lists no course", () => {
        expect(home.progress.kind).toBe("ready");
        expect(teaching()).toEqual([]);
      });
    });
  });
});
