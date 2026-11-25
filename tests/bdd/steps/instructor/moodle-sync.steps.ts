import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// Only the database, Moodle's web service and the published course fetch are replaced; the route,
// the educator check and the sync service are product code.
vi.mock("$app/env/private", () => ({
  MOODLE_WS_URL: "https://moodle.test/webservice/rest/server.php",
  MOODLE_WS_TOKEN: "token",
  MOODLE_WS_REST_FORMAT: "json",
  SYNC_INTERVAL_MINUTES: "60"
}));
vi.mock("../../../../apps/reader/src/lib/server/supabase-service.ts", async () => {
  const { recorder } = await import("../../support/supabase-recorder.ts");
  return { serviceSupabase: () => recorder };
});

import { POST } from "../../../../apps/reader/src/routes/api/courses/[courseid]/moodle-sync/+server.ts";
import { recorder } from "../../support/supabase-recorder.ts";

const feature = await loadFeature("tests/bdd/features/instructor/moodle-sync.feature");

describeFeature(feature, ({ Background, Rule }) => {
  let fetchCourse: ReturnType<typeof vi.fn>;
  let moodle: ReturnType<typeof vi.fn>;
  let response: Response | undefined;
  let failed: { status: number } | undefined;
  let courseId: string;

  const sync = async (login: string, moodleCourseId: string) => {
    response = undefined;
    failed = undefined;
    // Moodle is reached through the global fetch; the course check uses the event's fetch.
    vi.stubGlobal("fetch", moodle);
    try {
      response = await POST({
        params: { courseid: courseId },
        locals: { actor: login === "anonymous" ? null : { login } },
        fetch: fetchCourse,
        request: new Request("http://reader.test/", { method: "POST", body: JSON.stringify({ moodleCourseId }) })
      } as never);
    } catch (cause) {
      failed = cause as { status: number };
    } finally {
      vi.unstubAllGlobals();
    }
  };
  const failsWith = (status: number) => expect(failed).toMatchObject({ status });
  const moodleUntouched = () => expect(moodle).not.toHaveBeenCalled();
  const noWrites = () => {
    expect(recorder.upserts("assignments")).toEqual([]);
    expect(recorder.upserts("assignments_submissions")).toEqual([]);
  };

  Background(({ Given, And }) => {
    Given("{string} publishes an enrollment with {string} as educator", (_ctx, _id: string, educator: string) => {
      recorder.reset();
      courseId = "pf1";
      fetchCourse = vi.fn(async () => Response.json({ enrollment: { educators: [educator], whitelist: [], students: [] } }));
    });
    And(
      "Moodle course {int} has assignment {int} {string} with one submission from Moodle user {int}",
      (_ctx, courseId: number, assignmentId: number, name: string, userId: number) => {
        moodle = vi.fn(async (_url: string, init: RequestInit) => {
          const body = init.body as URLSearchParams;
          if (body.get("wsfunction") === "core_course_get_contents" && body.get("courseid") === String(courseId)) {
            return Response.json([{ id: 1, modules: [{ id: 7, instance: assignmentId, name, modname: "assign" }] }]);
          }
          if (body.get("wsfunction") === "mod_assign_get_submissions") {
            return Response.json({ assignments: [{ assignmentid: assignmentId, submissions: [{ id: 901, userid: userId, status: "submitted" }] }], warnings: [] });
          }
          return Response.json({ exception: "unexpected", message: body.get("wsfunction") });
        });
      }
    );
  });

  Rule(
    "When a course educator syncs a Moodle course, the data API shall copy that course's Moodle assignments and submissions into the tables Tutors Time reads.",
    ({ RuleScenario }) => {
      const succeeds = () => {
        expect(failed).toBeUndefined();
        expect(response!.status).toBe(200);
        expect(response!.headers.get("cache-control")).toBe("private, no-store");
      };
      const savedFor = (_ctx: unknown, id: number, name: string, course: string) => {
        expect(recorder.rows("assignments")).toEqual([expect.objectContaining({ id, name, courseid: course })]);
      };

      RuleScenario("An educator's sync copies assignments and submissions", ({ When, Then, And }) => {
        When("{string} syncs Moodle course {string}", (_ctx, login: string, id: string) => sync(login, id));
        Then("the sync shall succeed", succeeds);
        And("assignment {int} {string} shall be saved for course {string}", savedFor);
        And("a submission from Moodle user {int} shall be saved for assignment {int}", (_ctx, userId: number, assignmentId: number) => {
          expect(recorder.rows("assignments_submissions")).toEqual([expect.objectContaining({ external_userid: userId, assignmentId })]);
        });
      });

      RuleScenario("A course opened from its full Netlify URL is saved under its site name", ({ Given, When, Then, And }) => {
        Given("the reader opened the course from its full URL as {string}", (_ctx, id: string) => {
          courseId = id;
        });
        When("{string} syncs Moodle course {string}", (_ctx, login: string, id: string) => sync(login, id));
        Then("the sync shall succeed", succeeds);
        And("assignment {int} {string} shall be saved for course {string}", savedFor);
      });
    }
  );

  Rule(
    "If the requester is not a verified educator of the published course, or the Moodle ids are not positive whole numbers, then the data API shall refuse the Moodle sync without contacting Moodle.",
    ({ RuleScenario, RuleScenarioOutline }) => {
      RuleScenarioOutline("A student or visitor cannot run the sync", ({ When, Then, And }, variables) => {
        When("{string} syncs Moodle course {string}", (_ctx, _login: string, id: string) => sync(variables.login, id));
        Then("the sync shall fail with status <status>", () => failsWith(Number(variables.status)));
        And("Moodle shall not have been contacted", moodleUntouched);
        And("nothing shall have been written", noWrites);
      });

      RuleScenario("A Moodle course id that is not a positive whole number is refused", ({ When, Then, And }) => {
        When("{string} syncs Moodle course {string}", (_ctx, login: string, id: string) => sync(login, id));
        Then("the sync shall fail with status {int}", (_ctx, status: number) => failsWith(status));
        And("Moodle shall not have been contacted", moodleUntouched);
        And("nothing shall have been written", noWrites);
      });
    }
  );
});
