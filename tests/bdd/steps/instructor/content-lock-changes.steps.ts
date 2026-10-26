import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// Only the databases and the published course fetch are replaced; the route, the educator check and the lock store are product code.
const service = vi.hoisted(() => ({ configured: true }));
vi.mock("../../../../apps/reader/src/lib/server/supabase-service.ts", async () => {
  const { recorder } = await import("../../support/supabase-recorder.ts");
  return { serviceSupabase: () => (service.configured ? recorder : null) };
});
vi.mock("@tutors/community/utils/supabase-client", async () => ({ supabase: (await import("../../support/supabase-recorder.ts")).recorder }));

import { PUT } from "../../../../apps/reader/src/routes/api/courses/[courseid]/locks/+server.ts";
import { upsertLock } from "../../../../packages/svelte/utils/rbac/src/lock-store.ts";
import { recorder } from "../../support/supabase-recorder.ts";

const feature = await loadFeature("tests/bdd/features/instructor/content-lock-changes.feature");

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let fetchCourse: ReturnType<typeof vi.fn>;
  let response: Response | undefined;
  let failed: { status: number } | undefined;

  const change = async (login: string, loRoute: string, locked: boolean) => {
    response = undefined;
    failed = undefined;
    try {
      response = await PUT({
        params: { courseid: courseId },
        locals: { actor: login === "anonymous" ? null : { login } },
        fetch: fetchCourse,
        // A forged lockedBy in the body must not reach the table.
        request: new Request("http://reader.test/", { method: "PUT", body: JSON.stringify({ loRoute, locked, lockedBy: "forged" }) })
      } as never);
    } catch (cause) {
      failed = cause as { status: number };
    }
  };
  const saved = (loRoute: string) => recorder.rows("tutors_content_locks").find((row) => row.lo_route === loRoute);
  const noWrites = () => expect(recorder.upserts("tutors_content_locks")).toEqual([]);

  Background(({ Given }) => {
    Given("{string} publishes an enrollment with {string} as educator", (_ctx, id: string, educator: string) => {
      recorder.reset();
      service.configured = true;
      courseId = id;
      fetchCourse = vi.fn(async () => Response.json({ enrollment: { educators: [educator], whitelist: [], students: [] } }));
    });
  });

  Rule(
    "When a course educator locks or unlocks a resource, the data API shall save the lock with the educator's own GitHub login as the person who changed it.",
    ({ RuleScenario }) => {
      RuleScenario("Locking and unlocking a topic saves who changed it", ({ When, Then, And }) => {
        When("{string} locks {string}", (_ctx, login: string, loRoute: string) => change(login, loRoute, true));
        Then("the lock change shall succeed", () => {
          expect(failed).toBeUndefined();
          expect(response!.status).toBe(200);
          expect(response!.headers.get("cache-control")).toBe("private, no-store");
        });
        And("{string} shall be saved as locked by {string}", (_ctx, loRoute: string, login: string) => {
          expect(saved(loRoute)).toMatchObject({ course_id: "pf1", lo_route: loRoute, locked: true, locked_by: login });
        });
        When("{string} unlocks {string}", (_ctx, login: string, loRoute: string) => change(login, loRoute, false));
        Then("{string} shall be saved as unlocked by {string}", (_ctx, loRoute: string, login: string) => {
          expect(failed).toBeUndefined();
          expect(recorder.rows("tutors_content_locks")).toHaveLength(1);
          expect(saved(loRoute)).toMatchObject({ locked: false, locked_by: login });
        });
      });

      RuleScenario("Educator Control sends the change to the server, not the database", ({ When, Then, And }) => {
        let browserFetch: ReturnType<typeof vi.fn>;
        When("Educator Control locks {string}", async (_ctx, loRoute: string) => {
          browserFetch = vi.fn(async () => Response.json({ ok: true }));
          vi.stubGlobal("fetch", browserFetch);
          try {
            expect(await upsertLock("pf1", loRoute, true)).toBe("saved");
          } finally {
            vi.unstubAllGlobals();
          }
        });
        Then("the browser shall have asked the server to lock {string}", (_ctx, loRoute: string) => {
          expect(browserFetch).toHaveBeenCalledWith("/api/courses/pf1/locks", expect.objectContaining({ method: "PUT" }));
          expect(JSON.parse(browserFetch.mock.calls[0][1].body)).toEqual({ loRoute, locked: true });
        });
        And("the browser shall not have written to the database", () => {
          expect(recorder.tableCalls).toEqual([]);
        });
      });
    }
  );

  Rule("If the requester is not a verified educator of the published course, then the data API shall refuse the lock change without writing to the database.", ({ RuleScenario, RuleScenarioOutline }) => {
    RuleScenarioOutline("A student or visitor cannot change a lock", ({ When, Then, And }, variables) => {
      When("{string} locks {string}", (_ctx, _login: string, loRoute: string) => change(variables.login, loRoute, true));
      Then("the lock change shall fail with status <status>", () => {
        expect(failed).toMatchObject({ status: Number(variables.status) });
      });
      And("no lock shall have been written", noWrites);
    });

    RuleScenario("A course id outside the Netlify forms is refused before any fetch", ({ Given, When, Then, And }) => {
      Given("the lock change targets {string}", (_ctx, id: string) => {
        courseId = id;
      });
      When("{string} locks {string}", (_ctx, login: string, loRoute: string) => change(login, loRoute, true));
      Then("the lock change shall fail with status {number}", (_ctx, status: number) => {
        expect(failed).toMatchObject({ status });
        expect(fetchCourse).not.toHaveBeenCalled();
      });
      And("no lock shall have been written", noWrites);
    });
  });

  Rule("If the server has no database service key or the write fails, then the data API shall refuse the lock change and report it as not saved.", ({ RuleScenarioOutline }) => {
    RuleScenarioOutline("The server cannot save the lock", ({ Given, When, Then }, variables) => {
      Given("the {string} is unavailable", () => {
        if (variables.dependency === "service key") service.configured = false;
        if (variables.dependency === "database") recorder.tableErrors.set("tutors_content_locks", { message: "offline" });
      });
      When("{string} locks {string}", (_ctx, login: string, loRoute: string) => change(login, loRoute, true));
      Then("the lock change shall fail with status <status>", () => {
        expect(failed).toMatchObject({ status: Number(variables.status) });
      });
    });
  });
});
