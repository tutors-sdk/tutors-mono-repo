import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { load } from "js-yaml";

// Only the database and published course fetch are replaced; the request handler and YAML generation are product code.
vi.mock("@tutors/community/utils/supabase-client", async () => ({ supabase: (await import("../../support/supabase-recorder.ts")).recorder }));

import { GET } from "../../../../apps/reader/src/routes/api/courses/[courseid]/enrollment/+server.ts";
import { recorder } from "../../support/supabase-recorder.ts";

const feature = await loadFeature("tests/bdd/features/instructor/enrollment-export.feature");
type Draft = { educators: string[]; whitelist: string[]; students: { name: string; id: string }[]; groups?: unknown };
const csv = (value: string) => value.split(",").map((part) => part.trim());

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let enrollment: Draft;
  let published: Record<string, unknown>;
  let response: Response | undefined;
  let failed: { status: number } | undefined;
  let draft: Draft;
  let fetchCourse: ReturnType<typeof vi.fn>;

  const visitors = (_ctx: unknown, names: string) => {
    recorder.seed(
      "calendar",
      csv(names).map((studentid, index) => ({ id: `2026-09-${index + 1}`, studentid, courseid: "pf1" }))
    );
  };
  const request = async (_ctx: unknown, login: string) => {
    try {
      response = await GET({
        params: { courseid: courseId },
        locals: { actor: login === "anonymous" ? null : { login } },
        fetch: fetchCourse
      } as never);
      draft = load(await response.clone().text()) as Draft;
    } catch (cause) {
      failed = cause as { status: number };
    }
  };
  const failure = (_ctx: unknown, status: number) => {
    expect(failed).toMatchObject({ status });
    expect(response).toBeUndefined();
  };
  const empty = () => {
    expect(failed).toBeUndefined();
    expect(draft.students).toEqual([]);
    expect(draft.whitelist).toEqual([]);
    expect(draft.educators).toEqual(["lecturer"]);
  };

  Background(({ Given }) => {
    Given("{string} publishes an enrollment with {string} as educator", (_ctx, id: string, educator: string) => {
      recorder.reset();
      courseId = id;
      enrollment = { educators: [educator], whitelist: [], students: [] };
      published = { enrollment };
      response = undefined;
      failed = undefined;
      fetchCourse = vi.fn(async () => Response.json(published));
    });
  });

  Rule(
    "When a course educator exports enrollment, the data API shall download a draft enrollment.yaml containing each recorded course visitor once and preserving existing enrollment entries.",
    ({ RuleScenario, RuleScenarioOutline }) => {
      RuleScenario("Export adds visitors and preserves manually entered details", ({ Given, And, When, Then }) => {
        Given("the enrollment already lists {string} as {string} and whitelists {string}", (_ctx, id: string, name: string, absent: string) => {
          enrollment.students.push({ name, id });
          enrollment.whitelist.push(id, absent);
          enrollment.groups = { tutorial: [id] };
        });
        And("the recorded visitors are {string}", visitors);
        And("{string} has activity only in another course", (_ctx, studentid: string) => {
          recorder.seed("calendar", [{ id: "2026-09-01", studentid, courseid: "other-course" }]);
        });
        And("GitHub names include {string} as {string} and {string} as {string}", (_ctx, first: string, firstName: string, second: string, secondName: string) => {
          recorder.seed("tutors-connect-users", [
            { github_id: first, full_name: firstName },
            { github_id: second, full_name: secondName }
          ]);
        });
        When("{string} requests the enrollment export", request);
        Then("the download shall preserve the educators, whitelist and named entries", () => {
          expect(failed).toBeUndefined();
          expect(draft.educators).toEqual(["lecturer"]);
          expect(draft.whitelist).toEqual(["Alice", "absent", "bob"]);
          expect(draft.students[0]).toEqual({ name: "Alice from the class list", id: "Alice" });
          expect(draft.groups).toEqual(enrollment.groups);
        });
        And("the new student shall have the literal name {string} and id {string}", (_ctx, name: string, id: string) => {
          expect(draft.students[1]).toEqual({ name, id });
        });
        And("the draft shall exclude educators and visitors of other courses from new student entries", () => {
          expect(draft.students.map((student) => student.id)).toEqual(["Alice", "bob"]);
        });
        And("the download shall be private and named {string}", async (_ctx, name: string) => {
          expect(response!.headers.get("content-type")).toContain("application/yaml");
          expect(response!.headers.get("content-disposition")).toBe(`attachment; filename="${name}"`);
          expect(response!.headers.get("cache-control")).toBe("private, no-store");
          expect(await response!.text()).toContain("# Draft enrollment");
        });
        And("the export shall not write to the database", () => {
          expect(recorder.tableCalls.every((call) => call.op === "select")).toBe(true);
        });
      });

      RuleScenario("Missing names fall back to GitHub usernames", ({ Given, When, Then }) => {
        Given("the recorded visitors are {string}", visitors);
        When("{string} requests the enrollment export", request);
        Then("the student names shall be {string}", (_ctx, names: string) => {
          expect(failed).toBeUndefined();
          expect(draft.students.map((student) => student.name)).toEqual(csv(names));
        });
      });

      RuleScenarioOutline("Export retains activity for URL-derived course IDs", ({ Given, And, When, Then }, variables) => {
        Given("the reader identifies the course as {string}", () => {
          courseId = variables.courseId;
        });
        And("{string} has recorded activity for that course", (_ctx, studentid: string) => {
          recorder.seed("calendar", [{ id: "2026-09-01", studentid, courseid: courseId }]);
        });
        And("{string} has activity under the plain site name", (_ctx, studentid: string) => {
          recorder.seed("calendar", [{ id: "2026-09-01", studentid, courseid: "pf1" }]);
        });
        When("{string} requests the enrollment export", request);
        Then("the draft shall contain only the visitor {string}", (_ctx, login: string) => {
          expect(failed).toBeUndefined();
          expect(draft.whitelist).toEqual([login]);
          expect(draft.students).toEqual([{ id: login, name: login }]);
        });
        And("the published enrollment shall be fetched from {string}", (_ctx, url: string) => {
          expect(fetchCourse).toHaveBeenCalledWith(url, expect.objectContaining({ credentials: "omit", redirect: "error" }));
        });
      });

      RuleScenario("A course with no recorded activity still has a valid draft", ({ When, Then }) => {
        When("{string} requests the enrollment export", request);
        Then("the draft shall contain empty student and whitelist arrays", empty);
      });

      RuleScenario("A full cohort is exported across database pages", ({ Given, When, Then, And }) => {
        Given("{number} students have {number} days of recorded course activity", (_ctx, count: number, days: number) => {
          for (let student = 0; student < count; student++) {
            const login = `student-${student}`;
            recorder.seed(
              "calendar",
              Array.from({ length: days }, (_, day) => ({ id: `2026-09-${day + 1}`, courseid: "pf1", studentid: login }))
            );
            recorder.seed("tutors-connect-users", [{ github_id: login, full_name: `Student ${student}` }]);
          }
        });
        When("{string} requests the enrollment export", request);
        Then("all {number} students shall appear once with their GitHub names", (_ctx, count: number) => {
          expect(failed).toBeUndefined();
          expect(draft.students).toHaveLength(count);
          expect(new Set(draft.whitelist).size).toBe(count);
          for (let student = 0; student < count; student++) {
            expect(draft.students).toContainEqual({ name: `Student ${student}`, id: `student-${student}` });
          }
        });
        And("every database page shall have been read", () => {
          expect(recorder.tableCalls.filter((call) => call.table === "calendar").map((call) => call.range)).toEqual([
            [0, 499],
            [500, 999],
            [750, 1249]
          ]);
          expect(recorder.tableCalls.filter((call) => call.table === "tutors-connect-users")).toHaveLength(2);
        });
      });
    }
  );

  Rule(
    "If the requester is not a verified educator of the published course, then the data API shall reject the enrollment export before reading student data.",
    ({ RuleScenario, RuleScenarioOutline }) => {
      RuleScenarioOutline("A visitor cannot export another course's students", ({ When, Then, And }, variables) => {
        When("{string} requests the enrollment export", () => request(undefined, variables.login));
        Then("the export shall fail with status {string}", () => failure(undefined, Number(variables.status)));
        And("no student data shall have been read", () => expect(recorder.tableCalls).toEqual([]));
      });
      RuleScenario("A course cannot choose a different course's activity", ({ Given, And, When, Then }) => {
        Given("the published course claims the course id {string}", (_ctx, id: string) => {
          published.courseId = id;
        });
        And("{string} has activity only in another course", (_ctx, studentid: string) => {
          recorder.seed("calendar", [{ id: "2026-09-01", studentid, courseid: "other-course" }]);
        });
        When("{string} requests the enrollment export", request);
        Then("the draft shall contain empty student and whitelist arrays", empty);
      });
    }
  );

  Rule("If the published enrollment or student data cannot be read, then the data API shall fail the export without a partial download.", ({ RuleScenarioOutline }) => {
    RuleScenarioOutline("Failed dependencies produce no enrollment file", ({ Given, When, Then }, variables) => {
      Given("the {string} cannot be read", () => {
        const dependency = variables.dependency;
        if (dependency === "course") fetchCourse.mockRejectedValue(new Error("offline"));
        if (dependency === "enrollment") published.enrollment = { educators: ["lecturer"], students: "invalid" };
        if (dependency === "activity") recorder.tableErrors.set("calendar", { message: "offline" });
        if (dependency === "names") {
          visitors(undefined, "alice");
          recorder.tableErrors.set("tutors-connect-users", { message: "offline" });
        }
      });
      When("{string} requests the enrollment export", request);
      Then("the export shall fail with status {number}", failure);
    });
  });

  Rule(
    "If an export request supplies a course identifier outside the supported Netlify forms, then the data API shall reject it before fetching course content.",
    ({ RuleScenarioOutline }) => {
      RuleScenarioOutline("Untrusted course URLs are not fetched by the server", ({ Given, When, Then, And }, variables) => {
        Given("the export targets {string}", () => {
          courseId = variables.course;
        });
        When("{string} requests the enrollment export", request);
        Then("the export shall fail with status {number}", failure);
        And("no external fetch shall have been made", () => expect(fetchCourse).not.toHaveBeenCalled());
      });
    }
  );
});
