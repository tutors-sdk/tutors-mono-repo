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
  // What Moodle holds: each course's assignment modules, and each assignment's submissions.
  let moodleCourses: Map<number, { id: number; instance: number; name: string; modname: string }[]>;
  let moodleSubmissions: Map<number, { id: number; userid: number; status: string }[]>;
  let moodleFails: Set<string>;

  const sync = async (login: string, moodleCourseId: string, moodleSectionId?: number) => {
    response = undefined;
    failed = undefined;
    // Each sync is judged on its own calls to Moodle.
    moodle.mockClear();
    // Moodle is reached through the global fetch; the course check uses the event's fetch.
    vi.stubGlobal("fetch", moodle);
    try {
      response = await POST({
        params: { courseid: courseId },
        locals: { actor: login === "anonymous" ? null : { login } },
        fetch: fetchCourse,
        request: new Request("http://reader.test/", { method: "POST", body: JSON.stringify({ moodleCourseId, moodleSectionId }) })
      } as never);
    } catch (cause) {
      failed = cause as { status: number };
    } finally {
      vi.unstubAllGlobals();
    }
  };
  const failsWith = (status: number) => expect(failed).toMatchObject({ status });
  const succeeds = () => {
    expect(failed).toBeUndefined();
    expect(response!.status).toBe(200);
    expect(response!.headers.get("cache-control")).toBe("private, no-store");
  };
  const moodleUntouched = () => expect(moodle).not.toHaveBeenCalled();
  const moodleContacted = () => expect(moodle).toHaveBeenCalled();
  const noWrites = () => {
    expect(recorder.upserts("assignments")).toEqual([]);
    expect(recorder.upserts("assignments_submissions")).toEqual([]);
  };
  const submissionSaved = (_ctx: unknown, userId: number, assignmentId: number) => {
    expect(recorder.rows("assignments_submissions")).toContainEqual(expect.objectContaining({ external_userid: userId, assignmentId }));
  };
  // The sync service reads the time through the @tutors/runtime clock seam, which HARNESS_NOW freezes.
  const syncsAt = (_ctx: unknown, login: string, id: string, instant: string) => {
    vi.stubEnv("HARNESS_NOW", instant);
    return sync(login, id);
  };
  const syncedAt = async (_ctx: unknown, login: string, id: string, instant: string) => {
    await syncsAt(_ctx, login, id, instant);
    succeeds();
  };
  const completedSyncs = (course: string) => recorder.rows("moodle_syncs").filter((row) => row.courseid === course);
  const recordedAt = (_ctx: unknown, course: string, instant: string) => {
    expect(completedSyncs(course)).toEqual([expect.objectContaining({ synced_at: instant })]);
  };
  const addAssignment = (courseId: number, assignmentId: number, name: string, userId: number) => {
    moodleCourses.set(courseId, [...(moodleCourses.get(courseId) ?? []), { id: assignmentId + 100, instance: assignmentId, name, modname: "assign" }]);
    moodleSubmissions.set(assignmentId, [{ id: 900 + userId, userid: userId, status: "submitted" }]);
  };

  Background(({ Given, And }) => {
    Given("{string} publishes an enrollment with {string} as educator", (_ctx, _id: string, educator: string) => {
      recorder.reset();
      vi.unstubAllEnvs();
      courseId = "pf1";
      fetchCourse = vi.fn(async () => Response.json({ enrollment: { educators: [educator], whitelist: [], students: [] } }));
    });
    And(
      "Moodle course {int} has assignment {int} {string} with one submission from Moodle user {int}",
      (_ctx, courseId: number, assignmentId: number, name: string, userId: number) => {
        moodleCourses = new Map();
        moodleSubmissions = new Map();
        moodleFails = new Set();
        addAssignment(courseId, assignmentId, name, userId);
        moodle = vi.fn(async (_url: string, init: RequestInit) => {
          const body = init.body as URLSearchParams;
          const wsfunction = body.get("wsfunction")!;
          if (moodleFails.has(wsfunction)) return Response.json({ exception: "moodle_exception", message: "Moodle is unavailable" });
          if (wsfunction === "core_course_get_contents") {
            const course = moodleCourses.get(Number(body.get("courseid")));
            if (course) return Response.json([{ id: 1, modules: course }]);
          }
          if (wsfunction === "mod_assign_get_submissions") {
            const ids = [...body.entries()].filter(([key]) => key.startsWith("assignmentids")).map(([, value]) => Number(value));
            const assignments = ids.map((assignmentid) => ({ assignmentid, submissions: moodleSubmissions.get(assignmentid) ?? [] }));
            return Response.json({ assignments, warnings: [] });
          }
          return Response.json({ exception: "unexpected", message: wsfunction });
        });
      }
    );
  });

  Rule(
    "When a course educator syncs a Moodle course, the data API shall copy that course's Moodle assignments and submissions into the tables Tutors Time reads.",
    ({ RuleScenario }) => {
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

  Rule(
    "If a Moodle sync fails before every assignment, submission and the sync's completion time is saved, then the data API shall report the sync as failed and run the next sync request for that course without waiting for the sync interval.",
    ({ RuleScenarioOutline }) => {
      const failure = { message: "the database is unavailable" };
      const failures: Record<string, () => void> = {
        "fetching submissions from Moodle": () => moodleFails.add("mod_assign_get_submissions"),
        // Assignment 11's submissions are saved first, so the retry starts after some writes succeeded.
        "saving the submissions for assignment 12": () => recorder.upsertErrors.push({ table: "assignments_submissions", when: (row) => row.assignmentId === 12, error: failure }),
        "saving the assignments": () => recorder.tableErrors.set("assignments", failure),
        "recording the completed sync": () => recorder.tableErrors.set("moodle_syncs", failure)
      };

      RuleScenarioOutline("A sync that fails part way can be retried at once", ({ Given, When, Then, And }, variables) => {
        Given(
          "Moodle course {int} also has assignment {int} {string} with one submission from Moodle user {int}",
          (_ctx, courseId: number, assignmentId: number, name: string, userId: number) => addAssignment(courseId, assignmentId, name, userId)
        );
        And("<failing step> fails", () => failures[variables["failing step"]]());
        When("{string} syncs Moodle course {string} at {string}", syncsAt);
        Then("the sync shall fail with status {int}", (_ctx, status: number) => failsWith(status));
        And("no completed sync shall be recorded for course {string}", (_ctx, course: string) => {
          expect(completedSyncs(course)).toEqual([]);
        });
        Given("the failure has cleared", () => {
          moodleFails.clear();
          recorder.tableErrors.clear();
          recorder.upsertErrors = [];
        });
        When("{string} syncs Moodle course {string} again at {string}", syncsAt);
        Then("the sync shall succeed", succeeds);
        And("Moodle shall have been contacted again", moodleContacted);
        And("a submission from Moodle user {int} shall be saved for assignment {int}", submissionSaved);
      });
    }
  );

  Rule(
    "When a course educator syncs the same Moodle course and section again within SYNC_INTERVAL_MINUTES of its last completed sync, the data API shall answer success without contacting Moodle.",
    ({ RuleScenario }) => {
      RuleScenario("A repeat inside the interval is skipped", ({ Given, When, Then, And }) => {
        Given("{string} synced Moodle course {string} at {string}", syncedAt);
        When("{string} syncs Moodle course {string} again at {string}", syncsAt);
        Then("the sync shall succeed", succeeds);
        And("Moodle shall not have been contacted", moodleUntouched);
        And("the completed sync for course {string} shall be recorded at {string}", recordedAt);
      });

      RuleScenario("A repeat after the interval runs again", ({ Given, When, Then, And }) => {
        Given("{string} synced Moodle course {string} at {string}", syncedAt);
        When("{string} syncs Moodle course {string} again at {string}", syncsAt);
        Then("the sync shall succeed", succeeds);
        And("Moodle shall have been contacted again", moodleContacted);
        And("the completed sync for course {string} shall be recorded at {string}", recordedAt);
      });

      RuleScenario("A Moodle course with no assignments still completes the sync", ({ Given, When, Then, And }) => {
        Given("Moodle course {int} has no assignments", (_ctx, id: number) => {
          moodleCourses.set(id, []);
        });
        And("{string} synced Moodle course {string} at {string}", syncedAt);
        When("{string} syncs Moodle course {string} again at {string}", syncsAt);
        Then("the sync shall succeed", succeeds);
        And("Moodle shall not have been contacted", moodleUntouched);
      });

      RuleScenario("A section sync does not count as a sync of the whole course", ({ Given, When, Then, And }) => {
        Given("{string} synced section {int} of Moodle course {string} at {string}", async (_ctx, login: string, section: number, id: string, instant: string) => {
          vi.stubEnv("HARNESS_NOW", instant);
          await sync(login, id, section);
          succeeds();
        });
        When("{string} syncs Moodle course {string} again at {string}", syncsAt);
        Then("the sync shall succeed", succeeds);
        And("Moodle shall have been contacted again", moodleContacted);
      });
    }
  );
});
