import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public and
// private env, SvelteKit and Auth.js. The reader's route handlers, the connect and community services, the
// catalogue service and the time dashboard's layout are the real product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", async () => {
  const { publicEnv } = await import("../../support/supabase-recorder.ts");
  const { READER_ORIGIN } = await import("../../support/reader-api.ts");
  return { env: Object.assign(publicEnv, { PUBLIC_READER_URL: READER_ORIGIN }) };
});
vi.mock("$env/dynamic/private", async () => ({ env: (await import("../../support/supabase-recorder.ts")).privateEnv }));
vi.mock("$app/environment", () => ({ browser: true, building: false, goto: vi.fn() }));
vi.mock("../../../../packages/svelte/connect/node_modules/@auth/sveltekit/dist/client.js", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
// The time dashboard imports its own modules through SvelteKit's `$lib`; point it at the real files.
vi.mock("$lib/enrichCourseUserFields", async () => await import("../../../../apps/time/src/lib/enrichCourseUserFields.ts"));
vi.mock("$lib/time-source", async () => await import("../../../../apps/time/src/lib/time-source.ts"));

import type { Course, Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import { catalogueService } from "../../../../packages/svelte/community/src/services/catalogue.ts";
import { load as loadTimeCourse } from "../../../../apps/time/src/routes/[courseid]/(calendar-lab)/+layout.ts";
import { freshBrowser, githubUser, labsOf, openLo, publishedCourse, signIn } from "../../support/connect.ts";
import { anonPolicies, anyAnonPolicy, builtSchema, type Schema } from "../../support/migrations.ts";
import { apiRequests, readerRequest, setReaderSession } from "../../support/reader-api.ts";
import { recorder } from "../../support/supabase-recorder.ts";
import { tutorsId } from "../../../../packages/svelte/runes/src/index.svelte.ts";

const feature = await loadFeature("tests/bdd/features/shared/server-data-access.feature");

const ANON_KEY = "anon-key";
const STUDENT_TABLES = ["learning_records", "calendar", "tutors-connect-users", "tutors-connect-latest", "tutors-connect-profiles", "whiteboard_scenes"];
const capitalised = (login: string) => login[0].toUpperCase() + login.slice(1);

/** The browser's local day, the key of a calendar row. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The room a whiteboard learning object saves into, as guides/WHITEBOARD.md documents it. */
function personalRoom(course: Course, lo: Lo, login: string): string {
  return `wb-personal:${encodeURIComponent(course.courseId)}:${encodeURIComponent(lo.route)}:${encodeURIComponent(login)}`;
}

type TimeData = { role: string; calendar: Record<string, unknown>[]; learningRecords: Record<string, unknown>[]; users: Record<string, unknown>[] };

describeFeature(feature, ({ Background, Rule }) => {
  let course: Course;
  let response: Response;
  let body: unknown;
  let schema: Schema;
  let anonCallsBefore = 0;
  let timeCourse: { calendarModel: { week: { rows: { full_name: string }[] } } } | null;

  const firstLab = () => labsOf(course)[0];
  const expectCourse = (courseId: string) => expect(course.courseId).toBe(courseId);

  async function answer(r: Response) {
    response = r;
    body = r.headers.get("content-type")?.includes("application/json") ? await r.json() : await r.text();
  }

  const nobodySignedIn = () => {
    setReaderSession(null);
    tutorsId.value = null;
  };
  const signedIn = (_ctx: unknown, name: string) => signIn(githubUser(name));
  const readerAnswers = (_ctx: unknown, status: number) => expect(response.status).toBe(status);
  const nothingTouched = () => {
    expect(recorder.tableCalls).toEqual([]);
    expect(recorder.rpcCalls).toEqual([]);
  };

  const postPageLoad = async (_ctx: unknown, courseId: string, named: string) => {
    expectCourse(courseId);
    await answer(await readerRequest("POST", "/api/analytics", { kind: "page-load", courseId, loId: firstLab().route, loType: "lab", day: today(), studentId: named }));
  };

  function seedStudents(courseId: string, logins: string[]) {
    expectCourse(courseId);
    for (const login of logins) {
      recorder.seed("learning_records", [
        { course_id: courseId, student_id: login, lo_id: firstLab().route, duration: 4, count: 2, date_last_accessed: "2026-09-21T10:00:00Z", type: "lab" }
      ]);
      recorder.seed("calendar", [{ id: "2026-09-21", studentid: login, courseid: courseId, timeactive: 10, pageloads: 3 }]);
      recorder.seed("tutors-connect-users", [
        { github_id: login, full_name: capitalised(login), avatar_url: `https://avatars.example/${login}.png`, email: `${login}@example.com`, sentiment: "fine", online_status: "online" }
      ]);
    }
  }
  const seedThree = (_ctx: unknown, a: string, b: string, c: string, courseId: string) => seedStudents(courseId, [a, b, c]);
  const askTimeData = async (_ctx: unknown, courseId: string) => {
    expectCourse(courseId);
    await answer(await readerRequest("GET", `/api/time/${courseId}`));
  };
  const timeData = () => body as TimeData;
  const idsIn = (data: TimeData) => new Set([...data.calendar.map((r) => r.studentid), ...data.learningRecords.map((r) => r.student_id)]);

  const saveDrawing = async (who: string | null, courseId: string) => {
    expectCourse(courseId);
    await answer(await readerRequest("PUT", "/api/whiteboard", { courseId, route: firstLab().route, shared: false, elements: [{ id: `${who ?? "anonymous"}-rect`, type: "rectangle" }] }));
  };

  Background(({ Given }) => {
    Given("the course {string} is published with {number} labs and {string} as its educator", (_ctx, courseId: string, labs: number, educator: string) => {
      freshBrowser();
      course = publishedCourse(courseId, labs, {}, { educators: [educator], whitelist: [], students: [] });
    });
  });

  Rule(
    "If a request to record, read or change a student's data reaches the reader without a signed-in session, then the reader shall answer 401 and read or write no row.",
    ({ RuleScenario }) => {
      RuleScenario("An anonymous page load is refused", ({ Given, When, Then, And }) => {
        Given("nobody is signed in to the reader", nobodySignedIn);
        When("the browser posts a page load of the first lab of {string} naming the student {string}", postPageLoad);
        Then("the reader answers {number}", readerAnswers);
        And("no row is read from or written to the database", nothingTouched);
      });

      RuleScenario("An anonymous request for a course's time data is refused", ({ Given, When, Then, And }) => {
        Given("{string}, {string} and {string} have learning records and calendar rows in {string}", seedThree);
        And("nobody is signed in to the reader", nobodySignedIn);
        When("the browser asks the reader for the time data of {string}", askTimeData);
        Then("the reader answers {number}", readerAnswers);
        And("no row is read from or written to the database", nothingTouched);
      });
    }
  );

  Rule(
    "The reader shall store a signed-in student's learning records, calendar, sentiment, online status and shared presence under the GitHub login of the session, whatever student id the request names.",
    ({ RuleScenario }) => {
      RuleScenario("A request naming another student is stored under the session's login", ({ Given, When, Then, And }) => {
        Given("{string} is signed in to the reader", signedIn);
        When("the browser posts a page load of the first lab of {string} naming the student {string}", async (ctx, courseId: string, named: string) => {
          await postPageLoad(ctx, courseId, named);
          expect(response.status).toBe(204);
        });
        And("the browser sets the sentiment {string} and the online status {string} naming the student {string}", async (_ctx, sentiment: string, onlineStatus: string, named: string) => {
          await answer(await readerRequest("PATCH", "/api/me", { sentiment, onlineStatus, githubId: named }));
          expect(response.status).toBe(204);
        });
        And("the browser shares presence on the first lab of {string} naming the student {string}", async (_ctx, courseId: string, named: string) => {
          expectCourse(courseId);
          const payload = { courseId, loRoute: firstLab().route, title: firstLab().title, type: "lab", user: { id: named, fullName: capitalised(named), avatar: `https://avatars.example/${named}.png`, sentiment: "neutral" } };
          await answer(await readerRequest("POST", "/api/presence", { courseId, payload }));
          expect(response.status).toBe(204);
        });
        Then("the learning record, calendar row and presence row are stored under {string}", (_ctx, login: string) => {
          expect(recorder.rows("learning_records").map((r) => r.student_id)).toEqual([login]);
          expect(recorder.rows("calendar").map((r) => r.studentid)).toEqual([login]);
          expect(recorder.rows("tutors-connect-latest")).toMatchObject([{ course_id: course.courseId, student_id: login, payload: { user: { id: login } } }]);
        });
        And("the user row of {string} has the sentiment {string} and the online status {string}", (_ctx, login: string, sentiment: string, onlineStatus: string) => {
          expect(recorder.rows("tutors-connect-users").find((r) => r.github_id === login)).toMatchObject({ sentiment, online_status: onlineStatus });
        });
        And("nothing is stored under {string}", (_ctx, login: string) => {
          for (const table of STUDENT_TABLES) expect(JSON.stringify(recorder.rows(table)), table).not.toContain(`"${login}"`);
        });
      });

      RuleScenario("A signed-in student's lab visit reaches the database only through the reader's server", ({ Given, When, Then, And }) => {
        Given("{string} is signed in to the reader", signedIn);
        When("{string} opens the first lab of {string}", async (_ctx, _name: string, courseId: string) => {
          expectCourse(courseId);
          await openLo(course, firstLab());
        });
        Then("the learning record and calendar row are stored under {string}", (_ctx, login: string) => {
          expect(recorder.rows("learning_records")).toMatchObject([{ course_id: course.courseId, student_id: login, lo_id: firstLab().route, type: "lab" }]);
          expect(recorder.rows("calendar")).toMatchObject([{ studentid: login, courseid: course.courseId }]);
        });
        And("no row was written with the browser's anon key", () => {
          const writes = recorder.callsWith(ANON_KEY).filter((c) => ("op" in c ? c.op !== "select" : true));
          expect(writes).toEqual([]);
        });
      });
    }
  );

  Rule(
    "If a signed-in user who is not an educator of a course asks the reader to lock or unlock its content, then the reader shall answer 403 and leave the course's locks unchanged.",
    ({ RuleScenario }) => {
      const askToLock = async (_ctx: unknown, courseId: string) => {
        expectCourse(courseId);
        await answer(await readerRequest("PUT", "/api/locks", { courseId, loRoute: firstLab().route, locked: true }));
      };

      RuleScenario("A student cannot lock a course's content", ({ Given, When, Then, And }) => {
        Given("{string} is signed in to the reader", signedIn);
        When("the browser asks the reader to lock the first lab of {string}", askToLock);
        Then("the reader answers {number}", readerAnswers);
        And("{string} has no content locks", (_ctx, courseId: string) => {
          expect(recorder.rows("tutors_content_locks").filter((r) => r.course_id === courseId)).toEqual([]);
        });
      });

      RuleScenario("The course's educator can lock its content", ({ Given, When, Then, And }) => {
        Given("{string} is signed in to the reader", signedIn);
        When("the browser asks the reader to lock the first lab of {string}", askToLock);
        Then("the reader answers {number}", readerAnswers);
        And("the first lab of {string} is locked by {string}", (_ctx, courseId: string, login: string) => {
          expect(recorder.rows("tutors_content_locks")).toMatchObject([{ course_id: courseId, lo_route: firstLab().route, locked: true, locked_by: login }]);
        });
      });
    }
  );

  Rule(
    "While a signed-in viewer is not an educator of a course, the reader shall return the course's time data with every other student's id replaced by a pseudonym and without any other student's name, avatar, sentiment or online status.",
    ({ RuleScenario }) => {
      RuleScenario("A student sees their own time and anonymous classmates", ({ Given, When, Then, And }) => {
        Given("{string}, {string} and {string} have learning records and calendar rows in {string}", seedThree);
        And("{string} is signed in to the reader", signedIn);
        When("the browser asks the reader for the time data of {string}", askTimeData);
        Then("the reader answers {number}", readerAnswers);
        And("the time data holds the rows of {string} under {string}", (_ctx, _owner: string, login: string) => {
          expect(timeData().calendar.filter((r) => r.studentid === login)).toHaveLength(1);
          expect(timeData().learningRecords.filter((r) => r.student_id === login)).toHaveLength(1);
        });
        And("the time data holds the other students' rows under {string} and {string}", (_ctx, first: string, second: string) => {
          const others = [...idsIn(timeData())].filter((id) => id !== tutorsId.value?.login);
          expect(others.sort()).toEqual([first, second]);
        });
        And("the time data names no student other than {string}", (_ctx, login: string) => {
          expect(timeData().users.map((u) => u.github_id)).toEqual([login]);
          const text = JSON.stringify(body);
          for (const other of ["alice", "bob"]) {
            expect(text).not.toContain(other);
            expect(text).not.toContain(capitalised(other));
          }
        });
      });

      RuleScenario("The course's educator sees every student by name", ({ Given, When, Then, And }) => {
        Given("{string}, {string} and {string} have learning records and calendar rows in {string}", seedThree);
        And("{string} is signed in to the reader", signedIn);
        When("the browser asks the reader for the time data of {string}", askTimeData);
        Then("the reader answers {number}", readerAnswers);
        And("the time data holds the rows of {string}, {string} and {string} with their names and avatars", (_ctx, a: string, b: string, c: string) => {
          expect([...idsIn(timeData())].sort()).toEqual([a, b, c]);
          for (const login of [a, b, c]) {
            expect(timeData().users.find((u) => u.github_id === login)).toMatchObject({ full_name: capitalised(login), avatar_url: `https://avatars.example/${login}.png` });
          }
        });
      });
    }
  );

  Rule(
    "When a viewer opens a course in the time dashboard, the time dashboard shall load the course's time data from the reader's API with the viewer's reader session instead of from the database.",
    ({ RuleScenario }) => {
      RuleScenario("A lecturer opens a course in the time dashboard", ({ Given, When, Then, And }) => {
        Given("{string} and {string} have learning records and calendar rows in {string}", (_ctx, a: string, b: string, courseId: string) => seedStudents(courseId, [a, b]));
        And("{string} is signed in to the reader", signedIn);
        When("{string} opens {string} in the time dashboard", async (_ctx, _name: string, courseId: string) => {
          anonCallsBefore = recorder.callsWith(ANON_KEY).length;
          const data = (await loadTimeCourse({ params: { courseid: courseId } } as unknown as Parameters<typeof loadTimeCourse>[0])) as { course: typeof timeCourse };
          timeCourse = data.course;
        });
        Then("the time dashboard asked the reader for {string} with the viewer's reader session", (_ctx, path: string) => {
          expect(apiRequests.filter((r) => r.url === path)).toMatchObject([{ method: "GET", credentials: "include", origin: "https://time.test", sessionLogin: "eve", status: 200 }]);
        });
        And("the time dashboard's calendar lists {string} and {string}", (_ctx, a: string, b: string) => {
          expect(timeCourse?.calendarModel.week.rows.map((r) => r.full_name).sort()).toEqual([a, b]);
        });
        And("the time dashboard read nothing from the database directly", () => {
          expect(recorder.callsWith(ANON_KEY).slice(anonCallsBefore)).toEqual([]);
        });
      });
    }
  );

  Rule(
    "While a student is signed in, the reader shall save the student's edits to a whiteboard learning object in a room that only that student's session can read or overwrite.",
    ({ RuleScenario }) => {
      RuleScenario("Each signed-in student's whiteboard edits are saved in their own room", ({ Given, When, Then, And }) => {
        const savesDrawing = async (_ctx: unknown, name: string, courseId: string) => {
          await saveDrawing(name, courseId);
          expect(response.status).toBe(204);
        };
        Given("{string} is signed in to the reader", signedIn);
        And("{string} has saved a drawing on the whiteboard of the first lab of {string}", savesDrawing);
        When("{string} is signed in to the reader", signedIn);
        And("{string} saves a drawing on the whiteboard of the first lab of {string}", savesDrawing);
        Then("the whiteboard of the first lab holds the drawing of {string} for {string} and the drawing of {string} for {string}", (_ctx, a: string, aLogin: string, b: string, bLogin: string) => {
          const scenes = recorder.rows("whiteboard_scenes");
          expect(scenes.find((s) => s.room_id === personalRoom(course, firstLab(), aLogin))?.elements).toEqual([{ id: `${a}-rect`, type: "rectangle" }]);
          expect(scenes.find((s) => s.room_id === personalRoom(course, firstLab(), bLogin))?.elements).toEqual([{ id: `${b}-rect`, type: "rectangle" }]);
          expect(scenes).toHaveLength(2);
        });
        And("the reader gives {string} back only the drawing of {string}", async (_ctx, _viewer: string, owner: string) => {
          const query = new URLSearchParams({ courseId: course.courseId, route: firstLab().route, shared: "false" });
          await answer(await readerRequest("GET", `/api/whiteboard?${query}`));
          expect(response.status).toBe(200);
          expect(body).toMatchObject({ scene: { elements: [{ id: `${owner}-rect` }] } });
        });
        And("a public shared route cannot read {string}'s personal drawing", async (_ctx, owner: string) => {
          const query = new URLSearchParams({ courseId: course.courseId, route: `${firstLab().route}-${owner.toLowerCase()}`, shared: "true" });
          await answer(await readerRequest("GET", `/api/whiteboard?${query}`));
          expect(response.status).toBe(200);
          expect(body).toEqual({ scene: null });
        });
        And("the database gives the anon key no policy on whiteboard_scenes", () => {
          expect(anyAnonPolicy(builtSchema(), "whiteboard_scenes")).toEqual([]);
        });
      });

      RuleScenario("An anonymous visitor's whiteboard edits are not saved", ({ Given, When, Then, And }) => {
        Given("nobody is signed in to the reader", nobodySignedIn);
        When("the browser saves a drawing on the whiteboard of the first lab of {string}", (_ctx, courseId: string) => saveDrawing(null, courseId));
        Then("the reader answers {number}", readerAnswers);
        And("no whiteboard scene is stored", () => {
          expect(recorder.rows("whiteboard_scenes")).toEqual([]);
        });
      });
    }
  );

  Rule("Tutors shall give the anon key no read access to the rows of app_errors.", ({ RuleScenario }) => {
    RuleScenario("A browser can report an error but cannot read the error log", ({ When, Then, And }) => {
      When("the database is built from supabase/migrations in order", () => {
        schema = builtSchema();
      });
      Then("a policy lets the anon key insert into app_errors", () => {
        expect(anonPolicies(schema, "app_errors", "INSERT").length).toBeGreaterThan(0);
      });
      And("no policy lets the anon key read app_errors", () => {
        expect(anonPolicies(schema, "app_errors", "SELECT")).toEqual([]);
      });
      And("the error counts the health checks read run as the function's owner and return only app, level and count", () => {
        const fn = schema.functions.get("get_error_counts");
        expect(fn?.securityDefiner).toBe(true);
        expect(fn?.header).toMatch(/returns table\s*\(\s*app text,\s*level text,\s*count bigint\s*\)/i);
      });
    });
  });

  Rule("When a visitor opens the catalogue, the catalogue shall show the number of students without reading any student's profile.", ({ RuleScenario }) => {
    RuleScenario("The student count comes from a count, not from the profiles", ({ Given, When, Then, And }) => {
      let shown = 0;
      Given("{number} students have course-visit profiles", (_ctx, count: number) => {
        recorder.seed("tutors-connect-profiles", Array.from({ length: count }, (_, i) => ({ tutorId: `student${i}`, profile: [] })));
      });
      When("a visitor opens the catalogue", async () => {
        shown = await catalogueService.getStudentCount();
      });
      Then("the catalogue shows {number} students", (_ctx, count: number) => {
        expect(shown).toBe(count);
      });
      And("no student's profile was read", () => {
        expect(recorder.tableCalls.filter((c) => c.table === "tutors-connect-profiles")).toEqual([]);
      });
    });
  });
});
