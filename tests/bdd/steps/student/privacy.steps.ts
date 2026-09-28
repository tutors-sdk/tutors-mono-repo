import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", async () => ({ env: (await import("../../support/supabase-recorder.ts")).publicEnv }));
vi.mock("$app/environment", () => ({ browser: true, goto: vi.fn() }));
vi.mock("@auth/sveltekit/client", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { ALL_COURSES_CHANNEL, freshBrowser, githubUser, labsOf, openLo, publishedCourse, reloadPage, signIn } from "../../support/connect.ts";
import { recorder, settle } from "../../support/supabase-recorder.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { consent } from "../../../../packages/svelte/utils/privacy/src/index.ts";
import { tutorsConnectService } from "../../../../packages/svelte/connect/src/services/connect.svelte.ts";
import { GET as downloadData } from "../../../../apps/reader/src/routes/api/privacy/+server.ts";

const feature = await loadFeature("tests/bdd/features/student/privacy.feature");

const STUDENT_TABLES = [
  { table: "tutors-connect-users", column: "github_id", row: (login: string) => ({ github_id: login, full_name: login, avatar_url: `https://avatars.example/${login}.png` }) },
  { table: "tutors-connect-profiles", column: "tutorId", row: (login: string) => ({ tutorId: login, profile: { courseVisits: [{ id: "web-dev-101", visits: 3 }] } }) },
  { table: "tutors-connect-latest", column: "student_id", row: (login: string) => ({ course_id: "web-dev-101", student_id: login, payload: { user: { id: login } } }) },
  { table: "learning_records", column: "student_id", row: (login: string) => ({ course_id: "web-dev-101", student_id: login, lo_id: "/lab/web-dev-101/lab-1", count: 2, duration: 5 }) },
  { table: "calendar", column: "studentid", row: (login: string) => ({ id: "2026-09-25", studentid: login, courseid: "web-dev-101", timeactive: 5, pageloads: 2 }) }
];

describeFeature(feature, ({ Background, Rule }) => {
  let course: Course;
  let download: Response;
  let body: { tables?: Record<string, Record<string, unknown>[]> };

  const lab = (n: number) => labsOf(course)[n - 1];
  const both = { analytics: true, presence: true };
  const signInWith = (choice: { analytics: boolean; presence: boolean } | null) => (_ctx: unknown, name: string) => signIn(githubUser(name), choice);
  const broadcasts = () => [...recorder.sentOn(course.courseId), ...recorder.sentOn(ALL_COURSES_CHANNEL)];
  const learningRecordsOf = (login: string) => recorder.rows("learning_records").filter((row) => row.student_id === login);
  const calendarOf = (login: string) => [
    ...recorder.rows("calendar").filter((row) => row.studentid === login),
    ...recorder.rpcCalls.filter((call) => call.fn === "increment_calendar" && call.args.student_id_value === login)
  ];

  async function viewAndStay(_ctx: unknown, n: number, seconds: number) {
    await openLo(course, lab(n));
    vi.useFakeTimers();
    tutorsConnectService.startTimer();
    await vi.advanceTimersByTimeAsync(seconds * 1000);
    tutorsConnectService.stopTimer();
    vi.useRealTimers();
    await settle();
  }

  function nothingStoredFor(_ctx: unknown, login: string) {
    expect(learningRecordsOf(login)).toEqual([]);
    expect(calendarOf(login)).toEqual([]);
  }

  async function signOutThenSignIn(name: string) {
    reloadPage();
    await signIn(githubUser(name), null);
  }

  async function requestData(login: string | null, query = "") {
    const session = login ? { user: { login } } : null;
    download = await downloadData({ locals: { auth: async () => session }, url: new URL(`http://reader.test/api/privacy${query}`) } as never);
    body = await download.json();
  }

  function seedTwoStudents(_ctx: unknown, first: string, second: string) {
    for (const { table, row } of STUDENT_TABLES) recorder.seed(table, [row(first), row(second)]);
  }

  function holdsNoRecordOf(_ctx: unknown, login: string) {
    expect(JSON.stringify(body)).not.toContain(`"${login}"`);
  }

  Background(({ Given }) => {
    Given("the course {string} is published with {number} labs", (_ctx, courseId: string, labCount: number) => {
      freshBrowser();
      course = publishedCourse(courseId, labCount);
    });
  });

  Rule("While a signed-in student has not allowed learning analytics, the reader shall store none of that student's page loads or time active.", ({ RuleScenario }) => {
    RuleScenario("A student who has not chosen yet is not tracked", ({ Given, When, Then }) => {
      Given("the student {string} signs in without having made a privacy choice", signInWith(null));
      When("the student views lab {number} of the course and stays for {number} seconds", viewAndStay);
      Then("the reader shall store no learning records and no calendar time for {string}", nothingStoredFor);
    });

    RuleScenario("Turning learning analytics off stops the tracking", ({ Given, And, When, Then }) => {
      Given("the student {string} signs in having allowed learning analytics and presence sharing", signInWith(both));
      And("the student turns learning analytics off", () => tutorsConnectService.setConsent({ analytics: false, presence: true }));
      When("the student views lab {number} of the course and stays for {number} seconds", viewAndStay);
      Then("the reader shall store no learning records and no calendar time for {string}", nothingStoredFor);
    });

    RuleScenario("A student who allowed learning analytics is tracked", ({ Given, When, Then }) => {
      Given("the student {string} signs in having allowed learning analytics only", signInWith({ analytics: true, presence: false }));
      When("the student views lab {number} of the course and stays for {number} seconds", viewAndStay);
      Then("the reader shall store {number} page load and {number} blocks of time active for {string}", (_ctx, loads: number, blocks: number, login: string) => {
        expect(learningRecordsOf(login)).toMatchObject([{ lo_id: lab(1).route, count: loads }]);
        expect(recorder.rows("calendar")).toMatchObject([{ studentid: login, pageloads: loads }]);
        expect(recorder.rpcCalls.filter((call) => call.fn === "increment_calendar" && call.args.student_id_value === login)).toHaveLength(blocks);
      });
    });
  });

  Rule("While a signed-in student has not allowed presence sharing, the reader shall neither broadcast that student's activity nor mark that student online.", ({ RuleScenario }) => {
    const markedAs = (_ctx: unknown, login: string, status: string) => {
      expect(recorder.rows("tutors-connect-users")).toMatchObject([{ github_id: login, online_status: status }]);
    };

    RuleScenario("A student who has not chosen yet is not broadcast", ({ Given, When, Then, And }) => {
      Given("the student {string} signs in without having made a privacy choice", signInWith(null));
      When("the student views lab {number} of the course", (_ctx, n: number) => openLo(course, lab(n)));
      Then("the reader shall broadcast nothing and save no latest activity for {string}", () => {
        expect(broadcasts()).toEqual([]);
        expect(recorder.rows("tutors-connect-latest")).toEqual([]);
      });
      And("the reader shall mark {string} as {string}", markedAs);
    });

    RuleScenario("A student who allowed presence sharing is broadcast", ({ Given, When, Then, And }) => {
      Given("the student {string} signs in having allowed presence sharing only", signInWith({ analytics: false, presence: true }));
      When("the student views lab {number} of the course", (_ctx, n: number) => openLo(course, lab(n)));
      Then("the reader shall broadcast the visit to lab {number} and save it as the latest activity of {string}", (_ctx, n: number, login: string) => {
        expect(broadcasts().map((message) => (message.payload as { loRoute: string }).loRoute)).toEqual([lab(n).route, lab(n).route]);
        expect(recorder.rows("tutors-connect-latest")).toMatchObject([{ course_id: course.courseId, student_id: login }]);
      });
      And("the reader shall mark {string} as {string}", markedAs);
    });
  });

  Rule("When a student saves privacy choices, the reader shall apply them to that student's GitHub login alone.", ({ RuleScenario }) => {
    RuleScenario("A second student on the same browser starts with nothing allowed", ({ Given, And, When, Then }) => {
      Given("the student {string} signs in without having made a privacy choice", signInWith(null));
      And("the student allows learning analytics and presence sharing", () => tutorsConnectService.setConsent(both));
      When("{string} signs out and the student {string} signs in on the same browser", (_ctx, _first: string, second: string) => signOutThenSignIn(second));
      Then("{string} shall have made no privacy choice", () => {
        expect(consent.value).toBeNull();
      });
      And("viewing lab {number} of the course shall store no learning records for {string}", async (_ctx, n: number, login: string) => {
        await openLo(course, lab(n));
        expect(learningRecordsOf(login)).toEqual([]);
      });
    });

    RuleScenario("A student's choices return when they sign in again", ({ Given, And, When, Then }) => {
      Given("the student {string} signs in without having made a privacy choice", signInWith(null));
      And("the student allows learning analytics only", () => tutorsConnectService.setConsent({ analytics: true, presence: false }));
      When("{string} signs out and signs in again on the same browser", (_ctx, name: string) => signOutThenSignIn(name));
      Then("{string} shall have allowed learning analytics and not presence sharing", () => {
        expect(consent.value).toMatchObject({ analytics: true, presence: false });
      });
    });
  });

  Rule("When a signed-in student downloads their data, the reader shall return a file holding that student's identity, course history, learning records, calendar time and latest activity, and no other student's records.", ({ RuleScenario }) => {
    RuleScenario("Download my data", ({ Given, When, Then, And }) => {
      Given("{string} and {string} each have an identity, a course history, learning records, calendar time and a latest activity", seedTwoStudents);
      When("{string} downloads their data", (_ctx, login: string) => requestData(login));
      Then("the download shall be a JSON attachment named {string}", (_ctx, name: string) => {
        expect(download.status).toBe(200);
        expect(download.headers.get("content-type")).toContain("application/json");
        expect(download.headers.get("content-disposition")).toBe(`attachment; filename="${name}"`);
      });
      And("it shall hold the identity, course history, learning records, calendar time and latest activity of {string}", (_ctx, login: string) => {
        expect(Object.fromEntries(STUDENT_TABLES.map(({ table, row }) => [table, [row(login)]]))).toEqual(body.tables);
      });
      And("it shall hold no record of {string}", holdsNoRecordOf);
    });

    RuleScenario("A student cannot download another student's data", ({ Given, When, Then }) => {
      Given("{string} and {string} each have an identity, a course history, learning records, calendar time and a latest activity", seedTwoStudents);
      When("{string} downloads their data asking for the records of {string}", (_ctx, login: string, other: string) => requestData(login, `?userId=${other}`));
      Then("it shall hold no record of {string}", holdsNoRecordOf);
    });
  });

  Rule("If a request for a student's data carries no signed-in session, then the reader shall refuse it with status 401.", ({ RuleScenario }) => {
    RuleScenario("Download without signing in", ({ Given, When, Then }) => {
      Given("{string} and {string} each have an identity, a course history, learning records, calendar time and a latest activity", seedTwoStudents);
      When("someone who is not signed in asks for the records of {string}", (_ctx, login: string) => requestData(null, `?userId=${login}`));
      Then("the reader shall answer with status 401 and no records", () => {
        expect(download.status).toBe(401);
        expect(body.tables).toBeUndefined();
      });
    });
  });
});
