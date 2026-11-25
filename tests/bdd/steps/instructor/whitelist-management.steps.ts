import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public env,
// SvelteKit and the identity adapter. Everything between them is product code.
vi.mock("../../../../packages/adapters/driven/store-supabase/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$app/env/public", async () => (await import("../../support/supabase-recorder.ts")).publicEnv);
// `$app/env` and `$app/navigation` are aliased to one stub file, so one mock serves both.
vi.mock("$app/env", () => ({ browser: true, goto: vi.fn() }));
vi.mock("$app/env/private", async () => (await import("../../support/supabase-recorder.ts")).privateEnv);

import { goto } from "$app/navigation";
import { freshBrowser, githubUser, labsOf, openLo, publishedCourse, signIn } from "../../support/connect.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { tutorsConnectService } from "../../../../packages/adapters/driving/svelte-state/src/connect/services/connect.svelte.ts";
import { createAuthorization } from "../../../../apps/reader/src/lib/server/api/authorization.ts";
import { dataApiProfile } from "../../../../packages/adapters/driven/data-api/src/index.ts";

const feature = await loadFeature("tests/bdd/features/instructor/whitelist-management.feature");

const list = (csv: string) => csv.split(",").map((item) => item.trim());

describeFeature(feature, ({ Rule }) => {
  let course: Course;

  // `auth: 1` in properties.yaml is what makes the reader demand a sign-in; the whitelist comes from enrollment.yaml.
  const restrictedCourse = (_ctx: unknown, courseId: string, whitelist: string, educators: string) => {
    freshBrowser();
    course = publishedCourse(courseId, 1, { auth: 1 }, { whitelist: list(whitelist), educators: list(educators), students: [] });
  };
  const signedIn = (_ctx: unknown, name: string) => signIn(githubUser(name));
  const openCourse = () => openLo(course, labsOf(course)[0]);
  const granted = () => expect(goto).not.toHaveBeenCalled();
  /** The course ids My courses lists under Recently accessed, read as a newly opened page reads them: from the stored profile. */
  const recentlyAccessed = async () => {
    return (await dataApiProfile().getCourseVisits("")).filter((visit) => !visit.favourite).map((visit) => visit.id);
  };
  // `private: 1` and `auth: 1` in properties.yaml, as the harness's private course has them.
  const privateCourse = (_ctx: unknown, courseId: string, whitelist: string, educators: string) => {
    freshBrowser();
    course = publishedCourse(courseId, 1, { auth: 1, private: 1 }, { whitelist: list(whitelist), educators: list(educators), students: [] });
  };

  Rule("If nobody is signed in when a course that requires authentication is opened, then the reader shall send the visitor to sign in and remember the course for afterwards.", ({ RuleScenario }) => {
    RuleScenario("Private course requires authentication", ({ Given, And, When, Then }) => {
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
  });

  Rule("When a signed-in student on a course's whitelist opens the course, the reader shall show its content.", ({ RuleScenario }) => {
    RuleScenario("Whitelisted student can access private course", ({ Given, And, When, Then }) => {
      Given("the course {string} requires authentication, with the whitelist {string} and the educators {string}", restrictedCourse);
      And("{string} is signed in", signedIn);
      When("the course is opened", openCourse);
      Then("the system shall grant access to the course content", granted);
    });
  });

  Rule("If a signed-in student who is not on a course's whitelist opens the course, then the reader shall send them to the home page.", ({ RuleScenario }) => {
    RuleScenario("Non-whitelisted student denied access", ({ Given, And, When, Then }) => {
      Given("the course {string} requires authentication, with the whitelist {string} and the educators {string}", restrictedCourse);
      And("{string} is signed in", signedIn);
      When("the course is opened", openCourse);
      Then("the system shall deny access to the course content by sending the student to {string}", (_ctx, path: string) => {
        expect(vi.mocked(goto).mock.calls).toEqual([[path]]);
      });
    });
  });

  Rule("When an educator of a course opens it, the reader shall show its content whether or not the educator is on the whitelist.", ({ RuleScenario }) => {
    RuleScenario("Instructor always has access to their courses", ({ Given, And, When, Then }) => {
      Given("the course {string} requires authentication, with the whitelist {string} and the educators {string}", restrictedCourse);
      And("{string} is signed in", signedIn);
      When("the course is opened", openCourse);
      Then("the system shall grant access regardless of whitelist status", granted);
    });
  });

  Rule("The reader shall treat logins that differ only in capital letters as the same account when it checks a course's whitelist, its educators and the deployment's administrators.", ({ RuleScenario }) => {
    RuleScenario("A student whose login is capitalised differently on the whitelist is admitted", ({ Given, And, When, Then }) => {
      Given("the course {string} requires authentication, with the whitelist {string} and the educators {string}", restrictedCourse);
      And("{string} is signed in", signedIn);
      When("the course is opened", openCourse);
      Then("the system shall grant access to the course content", granted);
    });

    RuleScenario("An educator whose login is capitalised differently in the enrollment is an educator", ({ Given, And, When, Then }) => {
      // The server's decision, through the reader's own authorisation over a course host that answers `educators`.
      const serverFor = (educators: string, admins: string) =>
        createAuthorization({
          fetch: (async () => new Response(JSON.stringify({ enrollment: { educators: list(educators) } }))) as unknown as typeof fetch,
          admins: list(admins).filter(Boolean)
        });
      Given("the course {string} requires authentication, with the whitelist {string} and the educators {string}", restrictedCourse);
      And("{string} is signed in", signedIn);
      When("the course is opened", openCourse);
      Then("the system shall grant access regardless of whitelist status", granted);
      And("the reader's server shall let {string} lock content of a course whose educators are {string}", async (_ctx, login: string, educators: string) => {
        expect(await serverFor(educators, "").can({ login }, "content:lock", { kind: "course", courseId: "secure-101" })).toBe(true);
        expect(await serverFor(educators, "").can({ login: "mallory" }, "content:lock", { kind: "course", courseId: "secure-101" })).toBe(false);
      });
      And("the reader's server shall let {string} lock content of any course when the administrators are {string}", async (_ctx, login: string, admins: string) => {
        expect(await serverFor("", admins).can({ login }, "content:lock", { kind: "course", courseId: "any-course" })).toBe(true);
      });
    });
  });

  Rule(
    "If a signed-in student on neither the whitelist nor the educators of a private course opens it, then the reader shall leave that course out of the student's Recently accessed courses.",
    ({ RuleScenario }) => {
      RuleScenario("A student turned away from a private course does not see it in Recently accessed", ({ Given, And, When, Then }) => {
        Given("the private course {string}, with the whitelist {string} and the educators {string}", privateCourse);
        And("{string} is signed in", signedIn);
        When("the course is opened", openCourse);
        Then("the student is sent to {string}", (_ctx, path: string) => {
          expect(vi.mocked(goto).mock.calls).toEqual([[path]]);
        });
        And("{string} is not among the student's Recently accessed courses", async (_ctx, courseId: string) => {
          expect(await recentlyAccessed()).not.toContain(courseId);
        });
      });

      RuleScenario("A whitelisted student sees the private course in Recently accessed", ({ Given, And, When, Then }) => {
        Given("the private course {string}, with the whitelist {string} and the educators {string}", privateCourse);
        And("{string} is signed in", signedIn);
        When("the course is opened", openCourse);
        Then("{string} is among the student's Recently accessed courses", async (_ctx, courseId: string) => {
          expect(await recentlyAccessed()).toContain(courseId);
        });
      });
    }
  );
});
