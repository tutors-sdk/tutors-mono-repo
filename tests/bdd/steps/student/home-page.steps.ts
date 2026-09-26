import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the environment,
// SvelteKit and Auth.js. The home page's service, the data API client and the reader's /api/home route are product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", async () => ({ env: (await import("../../support/supabase-recorder.ts")).publicEnv }));
vi.mock("$env/dynamic/private", async () => ({ env: (await import("../../support/supabase-recorder.ts")).privateEnv }));
vi.mock("$app/environment", () => ({ browser: true, building: false, goto: vi.fn() }));
vi.mock("@auth/sveltekit/client", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { freshBrowser, githubUser, labsOf, publishedCourse, signIn } from "../../support/connect.ts";
import { apiRequests, takeCourseHostDown } from "../../support/reader-api.ts";
import { recorder } from "../../support/supabase-recorder.ts";
import type { Course, Lab, Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import { loadHome, type HomeView } from "../../../../packages/svelte/connect/src/services/home.ts";
import { localStorageProfile } from "../../../../packages/svelte/connect/src/services/localStorageProfile.ts";

const feature = await loadFeature("tests/bdd/features/student/home-page.feature");

describeFeature(feature, ({ Background, Rule }) => {
  const courses = new Map<string, Course>();
  let login = "";
  let home: HomeView;

  const lab = (courseId: string, n: number): Lo => labsOf(courses.get(courseId)!)[n - 1];
  const firstStep = (courseId: string, n: number): Lo => (lab(courseId, n) as Lab).los[0];
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

  function visit(courseId: string, hours = 1) {
    return { id: courseId, title: courses.get(courseId)!.title, lastVisit: hoursAgo(hours), credits: "", visits: 1 };
  }
  function record(courseId: string, lo: Lo, hours: number) {
    recorder.seed("learning_records", [
      { course_id: courseId, student_id: login, lo_id: lo.route, date_last_accessed: hoursAgo(hours), duration: 2, count: 1, type: lo.type }
    ]);
  }
  function progressOf(courseId: string) {
    expect(home.progress.kind).toBe("ready");
    return home.progress.kind === "ready" ? home.progress.courses[courseId] : undefined;
  }

  const signedIn = async (_ctx: unknown, name: string) => {
    const user = githubUser(name);
    login = user.login;
    recorder.seed("tutors-connect-profiles", [{ tutorId: login, profile: [visit("web-dev-101")] }]);
    await signIn(user);
  };
  const loadsProgressOf = async (_ctx: unknown, name: string) => {
    expect(login).toBe(githubUser(name).login);
    home = await loadHome();
  };
  const withLabsOneAndTwo = (_ctx: unknown, _name: string, courseId: string) => {
    record(courseId, lab(courseId, 1), 3);
    record(courseId, lab(courseId, 2), 2);
    record(courseId, firstStep(courseId, 2), 1);
  };
  const showsOpened = (_ctx: unknown, courseId: string, opened: number, total: number) => {
    expect(progressOf(courseId)).toMatchObject({ opened, total });
  };

  Background(({ Given }) => {
    Given("the course {string} is published with {number} labs", (_ctx, courseId: string, labs: number) => {
      freshBrowser();
      courses.clear();
      login = "";
      courses.set(courseId, publishedCourse(courseId, labs));
    });
  });

  Rule("When a signed-in student selects Continue on a course on the home page, the reader shall open the learning object the student last opened in that course.", ({ RuleScenario }) => {
    RuleScenario("Continue leads to the last lab opened", ({ Given, And, When, Then }) => {
      Given("{string} is signed in", signedIn);
      And("{string} last opened lab {number} of {string}, after lab {number}", (_ctx, _name: string, last: number, courseId: string, first: number) => {
        record(courseId, lab(courseId, first), 2);
        record(courseId, lab(courseId, last), 1);
      });
      When("the home page loads the progress of {string}", loadsProgressOf);
      Then("Continue on {string} leads to lab {number} of {string}", (_ctx, courseId: string, n: number) => {
        expect(progressOf(courseId)?.continueAt).toEqual({ route: lab(courseId, n).route, title: lab(courseId, n).title });
      });
    });

    RuleScenario("Continue leads to the lab step last opened", ({ Given, And, When, Then }) => {
      Given("{string} is signed in", signedIn);
      And("{string} last opened the first step of lab {number} of {string}", (_ctx, _name: string, n: number, courseId: string) => {
        record(courseId, lab(courseId, 1), 2);
        record(courseId, firstStep(courseId, n), 1);
      });
      When("the home page loads the progress of {string}", loadsProgressOf);
      Then("Continue on {string} leads to the first step of lab {number} of {string}", (_ctx, courseId: string, n: number) => {
        expect(progressOf(courseId)?.continueAt).toEqual({ route: firstStep(courseId, n).route, title: lab(courseId, n).title });
      });
    });
  });

  Rule(
    "While a signed-in student has learning records for a course, the reader shall show on the home page the number of that course's learning objects the student has opened out of the number the course publishes.",
    ({ RuleScenario }) => {
      RuleScenario("Progression counts the labs opened", ({ Given, And, When, Then }) => {
        Given("{string} is signed in", signedIn);
        And("{string} has learning records for labs 1 and 2 of {string} and for the first step of lab 2", withLabsOneAndTwo);
        When("the home page loads the progress of {string}", loadsProgressOf);
        Then("{string} shows {number} of {number} learning objects opened", showsOpened);
      });

      RuleScenario("No learning records, nothing opened", ({ Given, And, When, Then }) => {
        Given("{string} is signed in", signedIn);
        And("{string} has no learning records for {string}", (_ctx, _name: string, courseId: string) => {
          expect(recorder.rows("learning_records").filter((r) => r.course_id === courseId)).toEqual([]);
        });
        When("the home page loads the progress of {string}", loadsProgressOf);
        Then("{string} shows {number} of {number} learning objects opened and no Continue", (_ctx, courseId: string, opened: number, total: number) => {
          expect(progressOf(courseId)).toEqual({ opened, total, continueAt: null });
        });
      });
    }
  );

  Rule("While no one is signed in, the reader shall show on the home page the courses stored in the browser without progression.", ({ RuleScenario }) => {
    RuleScenario("A visitor who is not signed in sees no progression", ({ Given, When, Then, And }) => {
      Given("nobody is signed in and the browser has visited {string}", (_ctx, courseId: string) => {
        localStorageProfile.logCourseVisit(courses.get(courseId)!);
      });
      When("the home page loads", async () => {
        home = await loadHome();
      });
      Then("{string} is listed without progression", (_ctx, courseId: string) => {
        expect(home.visits.map((v) => v.id)).toEqual([courseId]);
        expect(home.progress).toEqual({ kind: "signed-out" });
      });
      And("the reader asks the data API for nothing", () => {
        expect(apiRequests).toEqual([]);
      });
    });

    RuleScenario("A signed-in student sees progression", ({ Given, And, When, Then }) => {
      Given("{string} is signed in", signedIn);
      And("{string} has learning records for labs 1 and 2 of {string} and for the first step of lab 2", withLabsOneAndTwo);
      When("the home page loads the progress of {string}", loadsProgressOf);
      Then("{string} shows {number} of {number} learning objects opened", showsOpened);
    });
  });

  Rule(
    "If the reader's data API does not answer while a signed-in student's home page loads, then the reader shall show progression as unavailable instead of as a number.",
    ({ RuleScenario }) => {
      RuleScenario("The data API is down", ({ Given, And, When, Then }) => {
        Given("{string} is signed in", signedIn);
        And("the reader's data API is down", () => {
          const reader = globalThis.fetch as typeof fetch & { fallback?: typeof fetch };
          const down = async (...[input, init]: Parameters<typeof fetch>) => {
            const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
            if (raw.startsWith("/api/")) throw new TypeError("fetch failed");
            return reader(input, init);
          };
          vi.stubGlobal("fetch", Object.assign(down, { fallback: reader.fallback }));
        });
        When("the home page loads the progress of {string}", loadsProgressOf);
        Then("progression is shown as unavailable", () => {
          expect(home.progress).toEqual({ kind: "unavailable" });
        });
      });

      RuleScenario("The course host is down", ({ Given, And, When, Then }) => {
        Given("{string} is signed in", signedIn);
        And("{string} has opened {string}, whose host is down and has never been read", (_ctx, _name: string, courseId: string) => {
          courses.set(courseId, publishedCourse(courseId, 2));
          takeCourseHostDown(courseId);
          const row = recorder.rows("tutors-connect-profiles").find((r) => r.tutorId === login)!;
          (row.profile as unknown[]).unshift(visit(courseId, 0.5));
        });
        When("the home page loads the progress of {string}", loadsProgressOf);
        Then("{string} shows its progression as unavailable", (_ctx, courseId: string) => {
          expect(progressOf(courseId)).toBeNull();
          expect(progressOf("web-dev-101")).toMatchObject({ total: 4 });
        });
      });
    }
  );
});
