import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { catalogueService } from "../../../../packages/svelte/community/src/services/catalogue.ts";
import { supabase } from "../../../../packages/svelte/community/src/utils/supabase-client.ts";
import { courseService } from "../../../../packages/svelte/course/src/course/services/course.svelte.ts";
import type { MockSupabaseClient } from "../../support/mocks.ts";
import { captureLogs, courseHost, publishedCourseJson, type CourseHost, type LogCapture } from "../../support/reader-loading.ts";

// `rune()` needs the Svelte compiler; see the stub for why a plain box is a faithful stand-in.
vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));
// Supabase is the network: the in-memory client stands in for it, and the catalogue service under test is the real one.
vi.mock("../../../../packages/svelte/community/src/utils/supabase-client.ts", async () => {
  const { MockSupabaseClient } = await import("../../support/mocks.ts");
  return { supabase: new MockSupabaseClient() };
});

const feature = await loadFeature("tests/bdd/features/shared/error-handling.feature");

const MALFORMED_BODIES: Record<string, string> = {
  "JSON cut off mid-document": '{"title": "Cut off", "los": [',
  "a course with no learning objects": '{"title": "No los", "type": "course"}',
  "a null document": "null"
};

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Rule }) => {
  let host: CourseHost;
  let logs: LogCapture;
  let failure: unknown;

  const load = async (_ctx: unknown, courseId: string) => {
    failure = undefined;
    try {
      await courseService.readCourse(courseId, host.fetch);
    } catch (error) {
      failure = error;
    }
  };
  const logged = (_ctx: unknown, message: string) => {
    expect(logs.errors().map((entry) => entry.message)).toContain(message);
  };
  const notCached = (_ctx: unknown, courseId: string) => {
    expect(courseService.courses.has(courseId)).toBe(false);
  };

  BeforeEachScenario(() => {
    courseService.courses.clear();
    host = courseHost();
    logs = captureLogs();
  });

  AfterEachScenario(() => {
    logs.stop();
  });

  Rule("If the course host answers 404 for a course, then the reader shall fail the load with a not-found message, log the error and cache nothing for that course.", ({ RuleScenario }) => {
    RuleScenario("Invalid course URL", ({ Given, When, Then, And }) => {
      Given("the course host answers 404 for {string}", (_ctx, courseId: string) => {
        host.answer(courseId, new Response("Not Found", { status: 404 }));
      });
      When("the reader loads the course {string}", load);
      Then("the load shall fail with the message {string}", (_ctx, message: string) => {
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toBe(message);
      });
      And("the reader shall have requested {string}", (_ctx, url: string) => {
        expect(host.requested).toEqual([url]);
      });
      And("the reader shall log the error {string}", logged);
      And("the reader shall not cache a course for {string}", notCached);
    });
  });

  Rule("If the network fails while the reader loads a course, then the reader shall fail the load, cache nothing and load the course on the next attempt once the network is back.", ({ RuleScenario }) => {
    RuleScenario("Network failure during course load", ({ Given, When, Then, And }) => {
      Given("the network is unavailable", () => {
        host.goOffline();
      });
      When("the reader loads the course {string}", load);
      Then("the load shall fail with the message {string}", (_ctx, message: string) => {
        expect(failure).toBeInstanceOf(TypeError);
        expect((failure as Error).message).toBe(message);
      });
      And("the reader shall log the error {string}", logged);
      And("the reader shall not cache a course for {string}", notCached);
      When("the network is restored and the reader loads the course {string} again", async (_ctx, courseId: string) => {
        host.goOnline();
        host.answer(courseId, new Response(publishedCourseJson("Web Development 101")));
        await load(undefined, courseId);
      });
      Then("the course title shall be {string}", (_ctx, title: string) => {
        expect(failure).toBeUndefined();
        expect(courseService.courses.get("web-dev-101")?.title).toBe(title);
      });
    });
  });

  Rule("If a course's JSON is cut off, has no learning objects or is null, then the reader shall fail the load, log the error and cache nothing for that course.", ({ RuleScenarioOutline }) => {
    RuleScenarioOutline("Malformed course JSON", ({ Given, When, Then, And }, variables) => {
      Given("the course host answers {string} with {string}", (_ctx, courseId: string) => {
        const body = MALFORMED_BODIES[variables.body];
        expect(body, `no malformed body called "${variables.body}"`).toBeDefined();
        host.answer(courseId, new Response(body));
      });
      When("the reader loads the course {string}", load);
      Then("the load shall fail with an error", () => {
        expect(failure).toBeInstanceOf(Error);
      });
      And("the reader shall log the error {string}", logged);
      And("the reader shall not cache a course for {string}", notCached);
    });
  });

  Rule("If the database query for the catalogue fails, then the catalogue shall list no courses until the database answers again.", ({ RuleScenario }) => {
    RuleScenario("Supabase query failure", ({ Given, And, When, Then }) => {
      const client = supabase as unknown as MockSupabaseClient;
      let catalogue: unknown[];

      Given("the catalogue holds {number} courses", (_ctx, count: number) => {
        client.clearAllErrors();
        client.setTableData(
          "tutors-connect-courses",
          Array.from({ length: count }, (_, i) => ({ course_id: `course-${i + 1}`, visited_at: `2026-07-0${i + 1}T00:00:00Z`, visit_count: 1 }))
        );
      });
      And("Supabase answers queries on {string} with the error {string}", (_ctx, table: string, message: string) => {
        client.setTableError(table, { message, code: "08006", details: null, hint: null });
      });
      When("the catalogue is read", async () => {
        catalogue = await catalogueService.getCatalogue();
      });
      Then("the catalogue shall fall back to an empty list", () => {
        expect(catalogue).toEqual([]);
      });
      And("the course count shall fall back to {number}", async (_ctx, count: number) => {
        expect(await catalogueService.getCatalogueCount()).toBe(count);
      });
      // The entry's message only: the logger drops the Supabase error's own text (normalizeArgs in packages/svelte/utils/logger spreads it into the entry, whose own message overwrites it).
      And("the catalogue service shall log the error {string}", logged);
      When("Supabase recovers and the catalogue is read again", async () => {
        client.clearAllErrors();
        catalogue = await catalogueService.getCatalogue();
      });
      Then("the catalogue shall list {number} courses", (_ctx, count: number) => {
        expect(catalogue).toHaveLength(count);
      });
    });
  });
});
