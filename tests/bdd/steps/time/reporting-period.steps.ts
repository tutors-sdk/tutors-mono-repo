import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { afterAll, expect, vi } from "vitest";

// The seams: the reader's time API over fetch, the runes behind i18n, and the public env. The route
// loaders, the time library's reader source and the address helpers between them are product code.
vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));
vi.mock("$app/env/public", async () => ({
  ...(await import("../../support/supabase-recorder.ts")).publicEnv,
  PUBLIC_READER_URL: "https://reader.test"
}));

import type { TableRow } from "../../support/time.ts";
import { load as loadCourseLayout } from "../../../../apps/time/src/routes/[courseid]/(calendar-lab)/+layout.ts";
import { load as loadStudentPage } from "../../../../apps/time/src/routes/[courseid]/[studentid]/+page.ts";
import { courseTimeHref, withDateRange } from "../../../../apps/time/src/lib/dateRange.ts";
import type { TutorsTimeCourse, TutorsTimeStudent } from "../../../../packages/jsr/time/src/types/index.ts";

const feature = await loadFeature("tests/bdd/features/time/reporting-period.feature");

/** The (calendar-lab) views; any other second segment is a student. */
const VIEWS = ["calendar", "lab", "medians", "assignments"];

/** One row of the `calendar` table, as the reader's time API returns it. */
type CalendarRow = { id: string; studentid: string; courseid: string; timeactive: number; pageloads: number };

describeFeature(feature, ({ Background, Rule }) => {
  let calendar: CalendarRow[] = [];
  let timeApiCalls: URL[] = [];
  let address: URL;
  let course: TutorsTimeCourse | null = null;
  let student: TutorsTimeStudent | null = null;
  let failure: unknown;

  afterAll(() => vi.unstubAllGlobals());

  /** The reader answers a course's time data for the period it was asked for, and no other days. */
  function timeApiResponse(url: URL): Response {
    const courseId = decodeURIComponent(url.pathname.slice("/api/time/".length));
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const rows = calendar.filter((row) => (!start || row.id >= start) && (!end || row.id <= end)).map((row) => ({ ...row, courseid: courseId }));
    const body = { courseId, role: "educator", course: null, calendar: rows, learningRecords: [], users: [], assignments: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }

  /** Run the loader SvelteKit runs for the address, as a navigation or a reload does. */
  async function navigate(href: string) {
    address = new URL(href, "https://time.example.org");
    const [courseid, second] = address.pathname.split("/").filter(Boolean);
    course = null;
    student = null;
    failure = undefined;
    try {
      if (VIEWS.includes(second)) {
        course = ((await loadCourseLayout({ params: { courseid }, url: address } as never)) as { course: TutorsTimeCourse }).course;
      } else {
        const data = (await loadStudentPage({ params: { courseid, studentid: second }, url: address } as never)) as { studentCalendar: TutorsTimeStudent };
        student = data.studentCalendar;
      }
    } catch (e) {
      failure = e;
    }
  }

  const currentCourse = () => address.pathname.split("/")[1];

  function addressCarriesPeriod(_ctx: unknown, search: string) {
    expect(address.search).toBe(search);
  }

  function minutesInTotal(_ctx: unknown, table: TableRow[]) {
    expect(failure).toBeUndefined();
    const totals = course!.calendarModel.day.rows.map((row) => ({ student: row.studentid, total: String(row.totalSeconds) }));
    expect(totals).toEqual(table);
  }

  async function opensCourseForPeriod(_ctx: unknown, courseId: string, start: string, end: string) {
    await navigate(courseTimeHref(courseId, { startDate: start || null, endDate: end || null }));
  }

  Background(({ Given }) => {
    Given("every course's calendar holds these entries:", (_ctx, table: TableRow[]) => {
      // Calendar rows store time active in 30-second blocks.
      calendar = table.map((row) => ({ id: row.date, studentid: row.student, courseid: "", timeactive: Number(row.minutes) * 2, pageloads: 1 }));
      timeApiCalls = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
          const url = new URL(input, "https://reader.test");
          if (!url.pathname.startsWith("/api/time/")) return { ok: false };
          timeApiCalls.push(url);
          return timeApiResponse(url);
        })
      );
    });
  });

  Rule(
    "When an instructor opens a course for a reporting period, the time dashboard shall show only the calendar activity dated from the period's start date to its end date, inclusive, in every view, drill-down and reload of that course.",
    ({ RuleScenario }) => {
      RuleScenario("A start and an end date bound the calendar the course opens with", ({ When, Then, And }) => {
        When("an instructor opens the course {string} for the period {string} to {string}", opensCourseForPeriod);
        Then("the address shall carry the period {string}", addressCarriesPeriod);
        And("the calendar shall be read for the days from {string} to {string}", (_ctx, start: string, end: string) => {
          const asked = timeApiCalls.at(-1);
          expect([asked?.searchParams.get("start"), asked?.searchParams.get("end")]).toEqual([start, end]);
        });
        And("the time dashboard shall show these minutes active in total:", minutesInTotal);
      });

      RuleScenario("Reloading the page keeps the period", ({ Given, When, Then, And }) => {
        Given("an instructor has opened the course {string} for the period {string} to {string}", opensCourseForPeriod);
        When("the instructor reloads the page", async () => {
          await navigate(address.pathname + address.search);
        });
        Then("the address shall carry the period {string}", addressCarriesPeriod);
        And("the time dashboard shall show these minutes active in total:", minutesInTotal);
      });

      RuleScenario("Switching view keeps the period", ({ Given, When, Then, And }) => {
        Given("an instructor has opened the course {string} for the period {string} to {string}", opensCourseForPeriod);
        When("the instructor switches to the {string} view", async (_ctx, view: string) => {
          await navigate(withDateRange(`/${currentCourse()}/${view}`, address.search));
        });
        Then("the address shall carry the period {string}", addressCarriesPeriod);
        And("the time dashboard shall show these minutes active in total:", minutesInTotal);
      });

      RuleScenario("Opening a student keeps the period", ({ Given, When, Then, And }) => {
        Given("an instructor has opened the course {string} for the period {string} to {string}", opensCourseForPeriod);
        When("the instructor opens the student {string}", async (_ctx, studentId: string) => {
          await navigate(withDateRange(`/${currentCourse()}/${studentId}`, address.search));
        });
        Then("the address shall carry the period {string}", addressCarriesPeriod);
        And("the student's calendar shall show {number} minutes active in total", (_ctx, minutes: number) => {
          expect(failure).toBeUndefined();
          expect(student!.calendarByDay?.totalSeconds).toBe(minutes);
        });
      });

      for (const title of ["A start date alone bounds the period from that day on", "An end date alone bounds the period up to that day", "No dates show the whole calendar"]) {
        RuleScenario(title, ({ When, Then, And }) => {
          When("an instructor opens the course {string} for the period {string} to {string}", opensCourseForPeriod);
          Then("the address shall carry the period {string}", addressCarriesPeriod);
          And("the time dashboard shall show these minutes active in total:", minutesInTotal);
        });
      }
    }
  );

  Rule(
    "If the address of a course gives a reporting period with a date that is not a calendar date, or with a start date after its end date, then the time dashboard shall show a 400 error naming the problem instead of the course's activity.",
    ({ RuleScenarioOutline }) => {
      RuleScenarioOutline("An unusable reporting period is refused, not widened", ({ When, Then, And }, variables) => {
        When('an instructor opens the address "<address>"', async () => {
          await navigate(variables.address);
        });
        Then('the time dashboard shall show a 400 error saying "<message>"', () => {
          expect(failure).toMatchObject({ status: 400, body: { message: variables.message } });
          expect(course).toBeNull();
          expect(student).toBeNull();
        });
        And("the calendar shall not be read", () => {
          expect(timeApiCalls).toEqual([]);
        });
      });
    }
  );
});
