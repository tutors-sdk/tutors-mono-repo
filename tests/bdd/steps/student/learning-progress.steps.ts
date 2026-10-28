import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public env,
// SvelteKit and the identity adapter. Everything between them is product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({
  createClient: (await import("../../support/supabase-recorder.ts")).createClient
}));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
// The time library builds its own client; locally it resolves a different copy of supabase-js, so its seam is `getSupabase`.
vi.mock("../../../../packages/jsr/time/src/services/supabase.ts", async () => ({ getSupabase: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$app/env/public", async () => (await import("../../support/supabase-recorder.ts")).publicEnv);
// `$app/env` and `$app/navigation` are aliased to one stub file, so one mock serves both.
vi.mock("$app/env", () => ({ browser: true, goto: vi.fn() }));
vi.mock("$app/env/private", async () => (await import("../../support/supabase-recorder.ts")).privateEnv);

import { freshBrowser, liveActivityStored, githubUser, labsOf, openLo, publishedCourse, signIn } from "../../support/connect.ts";
import { recorder, settle } from "../../support/supabase-recorder.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { BaseCalendarModel } from "../../../../packages/jsr/time/src/services/base-calendar-model.ts";
import { CourseTime } from "../../../../packages/jsr/time/src/services/course-time.ts";
import { formatTimeNearestMinute } from "../../../../packages/jsr/time/src/utils/calendar-utils.ts";
import { formatDate } from "../../../../packages/svelte/community/src/utils/supabase-client.ts";
import { tutorsConnectService } from "../../../../packages/svelte/connect/src/services/connect.svelte.ts";
import { currentLo } from "../../../../packages/svelte/runes/src/index.svelte.ts";
import { supabaseProfile } from "../../../../packages/svelte/connect/src/services/supabaseProfile.svelte.ts";
import type { CourseVisit } from "../../../../packages/svelte/connect/src/types.ts";

const feature = await loadFeature("tests/bdd/features/student/learning-progress.feature");

type TableRow = Record<string, string>;

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  const courses = new Map<string, Course>();
  let course: Course;
  let login: string;

  const learningRecord = (courseId: string, lab: number) => {
    const route = labsOf(courses.get(courseId)!)[lab - 1].route;
    return recorder.rows("learning_records").find((r) => r.course_id === courseId && r.student_id === login && r.lo_id === route);
  };
  const view = async (courseId: string, lab: number, times: number) => {
    const target = courses.get(courseId)!;
    for (let i = 0; i < times; i++) await openLo(target, labsOf(target)[lab - 1]);
  };
  const visitCourse = () => openLo(course, labsOf(course)[0]);
  /** What a newly opened page reads: the profile as stored, not what this tab still holds in memory. */
  const storedVisits = (): Promise<CourseVisit[]> => {
    supabaseProfile.courseVisits = [];
    return tutorsConnectService.getCourseVisits();
  };

  Background(({ Given, And }) => {
    Given("the course {string} is published with {number} labs", (_ctx, courseId: string, labCount: number) => {
      freshBrowser();
      courses.clear();
      course = publishedCourse(courseId, labCount);
      courses.set(courseId, course);
    });
    And("the student {string} is signed in", async (_ctx, name: string) => {
      login = githubUser(name).login;
      await signIn(githubUser(name));
    });
  });

  Rule("When a lecturer loads the time report of a course, the time dashboard shall show each student's total time active in hours and minutes.", ({ RuleScenario }) => {
    RuleScenario("View time spent on a course", ({ Given, When, Then, And }) => {
      let model: BaseCalendarModel;
      Given(
        "the calendar holds {number} thirty-second blocks of time active for {string} on {string} and {number} on {string}",
        (_ctx, blocks1: number, student: string, day1: string, blocks2: number, day2: string) => {
          recorder.seed("calendar", [
            { id: day1, studentid: student, courseid: course.courseId, timeactive: blocks1, pageloads: 1 },
            { id: day2, studentid: student, courseid: course.courseId, timeactive: blocks2, pageloads: 1 }
          ]);
        }
      );
      When("the time report for the course is loaded", async () => {
        model = new BaseCalendarModel(await CourseTime.getCalendarData(course.courseId), null);
      });
      Then("the system shall display {number} minutes of total time active for {string}", (_ctx, minutes: number, student: string) => {
        expect(model.day.rows.map((row) => [row.studentid, row.totalSeconds])).toEqual([[student, minutes]]);
      });
      And("time shall be displayed in hours and minutes as {string}", (_ctx, display: string) => {
        expect(formatTimeNearestMinute(model.day.rows[0].totalSeconds)).toBe(display);
      });
    });
  });

  let durationBefore: number;
  let timeActiveBefore: number;
  const today = () => recorder.rows("calendar").find((r) => r.id === formatDate(new Date()) && r.studentid === login && r.courseid === course.courseId);
  const viewLab = async (_ctx: unknown, lab: number, times: number) => view(course.courseId, lab, times);
  const staysOnPage = async (_ctx: unknown, seconds: number) => {
    durationBefore = learningRecord(course.courseId, 1)!.duration as number;
    timeActiveBefore = today()!.timeactive as number;
    vi.useFakeTimers();
    tutorsConnectService.startTimer();
    await vi.advanceTimersByTimeAsync(seconds * 1000);
    tutorsConnectService.stopTimer();
    vi.useRealTimers();
    await settle();
  };
  const recordedBlocks = (_ctx: unknown, blocks: number) => {
    expect((learningRecord(course.courseId, 1)!.duration as number) - durationBefore).toBe(blocks);
    expect((today()!.timeactive as number) - timeActiveBefore).toBe(blocks);
  };
  const countedPageLoads = (_ctx: unknown, count: number) => {
    expect(learningRecord(course.courseId, 1)).toMatchObject({ count, type: "lab" });
    expect(recorder.rows("calendar")).toMatchObject([{ id: formatDate(new Date()), studentid: login, courseid: course.courseId, pageloads: count }]);
  };
  const LEGACY_FUNCTIONS = ["get_count_learning_records", "increment_calendar"];
  const requests = (_ctx: unknown, count: number, fn: string) => {
    expect(recorder.rpcCalls.filter((call) => call.fn === fn)).toHaveLength(count);
    expect(recorder.rpcCalls.filter((call) => LEGACY_FUNCTIONS.includes(call.fn))).toEqual([]);
    expect(recorder.tableCalls.filter((call) => call.table === "learning_records" || call.table === "calendar")).toEqual([]);
  };

  Rule("When a signed-in student views a learning object, the reader shall count the page load and record each 30 seconds of activity against the learning object and the day's calendar.", ({ RuleScenario }) => {
    RuleScenario("Record learning activity", ({ When, Then, And }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the student stays on that page for {number} seconds", staysOnPage);
      Then("the system shall record {number} more blocks of time active against the lab and against the calendar for today", recordedBlocks);
      And("the system shall increment the page load count for the lab to {number}", countedPageLoads);
    });
  });

  Rule("When the dashboard of a signed-in student loads, the reader shall list the courses the student accessed recently with the date of each last visit.", ({ RuleScenario }) => {
    RuleScenario("Resume from last accessed position", ({ Given, When, Then, And }) => {
      let visits: CourseVisit[];
      Given("the student has previously accessed the course", visitCourse);
      When("the dashboard loads the recently accessed courses of the student", async () => {
        visits = await storedVisits();
      });
      Then("the system shall list {string} among the recently accessed courses", (_ctx, courseId: string) => {
        expect(visits.map((visit) => [visit.id, visit.title, visit.visits])).toEqual([[courseId, course.title, 1]]);
      });
      And("the entry shall show today as the last accessed date", () => {
        expect(formatDate(new Date(visits[0].lastVisit))).toBe(formatDate(new Date()));
      });
    });
  });

  Rule("When a student stars a course, the reader shall store the course among the favourites in the student's profile.", ({ RuleScenario }) => {
    RuleScenario("Star a favourite course", ({ Given, When, Then, And }) => {
      Given("the student has previously accessed the course", visitCourse);
      When("the student stars the course {string}", async (_ctx, courseId: string) => {
        await tutorsConnectService.favouriteCourse(courseId);
      });
      Then("the system shall store {string} as a favourite in the profile of the student", (_ctx, courseId: string) => {
        const stored = recorder.upserts("tutors-connect-profiles").at(-1)!;
        expect(stored.tutorId).toBe(login);
        expect((stored.profile as CourseVisit[]).filter((visit) => visit.favourite).map((visit) => visit.id)).toEqual([courseId]);
      });
      And("the home page shall load {string} among the favourites of the student", async (_ctx, courseId: string) => {
        const visits = await storedVisits();
        expect(visits.filter((visit) => visit.favourite).map((visit) => visit.id)).toEqual([courseId]);
      });
    });
  });

  Rule("When a signed-in student views learning objects in more than one course, the reader shall count page loads per learning object, grouped by course.", ({ RuleScenario }) => {
    RuleScenario("View learning records per learning object", ({ Given, When, Then, And }) => {
      Given("the course {string} is also published", (_ctx, courseId: string) => {
        courses.set(courseId, publishedCourse(courseId, 1));
      });
      When(
        "the student views lab {number} of {string} {number} times, lab {number} of {string} {number} time and lab {number} of {string} {number} times",
        async (_ctx, ...views: (number | string)[]) => {
          for (let i = 0; i < views.length; i += 3) await view(views[i + 1] as string, views[i] as number, views[i + 2] as number);
        }
      );
      Then("the system shall track page loads per learning object:", (_ctx, table: TableRow[]) => {
        for (const row of table) {
          expect(learningRecord(row.course, Number(row.lab)), `${row.course} lab ${row.lab}`).toMatchObject({ count: Number(row["page loads"]) });
        }
        expect(recorder.rows("learning_records")).toHaveLength(table.length);
      });
      And("the records shall be grouped by course, {number} for {string} and {number} for {string}", (_ctx, n1: number, c1: string, n2: number, c2: string) => {
        const perCourse = (courseId: string) => recorder.rows("learning_records").filter((r) => r.course_id === courseId).length;
        expect([perCourse(c1), perCourse(c2)]).toEqual([n1, n2]);
      });
    });
  });

  Rule("When a student opens a learning object, the reader shall report one learning event for it.", ({ RuleScenario }) => {
    /** Every event the reader stored for Tutors Live for `name`, in order: one upsert per learning event. */
    const reported = (name: string) => liveActivityStored(name);
    const viewLab = (_ctx: unknown, lab: number, times: number) => view(course.courseId, lab, times);
    const countedViews = (_ctx: unknown, count: number) => expect(learningRecord(course.courseId, 1)).toMatchObject({ count });
    const reportedCount = (_ctx: unknown, count: number, name: string) => expect(reported(name)).toHaveLength(count);

    RuleScenario("Page data settling does not report the view again", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      // The course layout reports from an `$effect` tracking the course, the learning object and the
      // id, so it runs again each time one of those resolves. Nothing about the page has changed.
      And("the course, the learning object and the identity of the student settle", async () => {
        tutorsConnectService.learningEvent({});
        tutorsConnectService.learningEvent({});
        await settle();
      });
      Then("the system shall increment the page load count for the lab to {number}", countedViews);
      And("the reader shall have reported {number} learning event for {string}", reportedCount);
    });

    RuleScenario("A change of mood on the same page is still reported", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the student changes their sentiment to {string}", async (_ctx, sentiment: string) => {
        await tutorsConnectService.updateSentiment(sentiment);
        // The id rune changed, so the layout's effect runs again - this time with something to say.
        tutorsConnectService.learningEvent({});
        await settle();
      });
      Then("the reader shall have reported {number} learning events for {string}", reportedCount);
      And("the last reported event shall carry the sentiment {string}", (_ctx, sentiment: string) => {
        expect(reported("Alice").at(-1)?.user?.sentiment).toBe(sentiment);
      });
    });
  });

  Rule("When a student moves to another learning object, the reader shall report one learning event, for the learning object they arrive at.", ({ RuleScenario }) => {
    const reported = (name: string) => liveActivityStored(name);
    const reportedCount = (_ctx: unknown, count: number, name: string) => expect(reported(name)).toHaveLength(count);
    const viewLab = (_ctx: unknown, lab: number, times: number) => view(course.courseId, lab, times);
    /** The route params SvelteKit gives a lab page: `/lab/[courseid]/[...loid]`. */
    const paramsOf = (lab: number) => {
      const [, , courseid, ...loid] = labsOf(course)[lab - 1].route.split("/");
      return { courseid, loid: loid.join("/") };
    };

    RuleScenario("The learning object loading before the address changes is not reported as a page", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      // What the course layout sees on a client-side move: navigation starts, the destination's load sets
      // `currentLo` while `page.params` still names the page being left, so the layout's effect runs with
      // the old address and the new learning object. Only when SvelteKit commits do the params catch up.
      And("the student moves to lab {number}, which loads before the address changes", async (_ctx, lab: number) => {
        const leaving = paramsOf(lab - 1);
        tutorsConnectService.navigating(labsOf(course)[lab - 2].route, labsOf(course)[lab - 1].route);
        currentLo.value = labsOf(course)[lab - 1];
        tutorsConnectService.learningEvent(leaving);
        tutorsConnectService.navigated();
        tutorsConnectService.learningEvent(paramsOf(lab));
        await settle();
      });
      Then(
        "the system shall count {number} page load for lab {number} and {number} for lab {number}",
        (_ctx, first: number, firstLab: number, second: number, secondLab: number) => {
          expect(learningRecord(course.courseId, firstLab)).toMatchObject({ count: first });
          expect(learningRecord(course.courseId, secondLab)).toMatchObject({ count: second });
        }
      );
      And("the reader shall have reported {number} learning events for {string}", reportedCount);
    });

    // An anchor link, the skip link or a search filter changes the hash or query, which SvelteKit treats
    // as a navigation, but the student is still on the same page.
    RuleScenario("A jump within the same page is not a new page load", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the student jumps to a heading on the same page", async () => {
        const path = labsOf(course)[0].route;
        tutorsConnectService.navigating(path, path);
        tutorsConnectService.navigated(path, path);
        // The same params `openLo` reported the view with: the page has not changed.
        tutorsConnectService.learningEvent({});
        await settle();
      });
      Then("the system shall increment the page load count for the lab to {number}", (_ctx, count: number) => expect(learningRecord(course.courseId, 1)).toMatchObject({ count }));
      And("the reader shall have reported {number} learning event for {string}", reportedCount);
    });

    // The quiz asks before a student leaves it; declining cancels the navigation, so no `afterNavigate` follows.
    RuleScenario("A move the student cancels does not hold back later reports", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the student starts to move to lab {number} but cancels", (_ctx, lab: number) => {
        const attempt = tutorsConnectService.navigating(labsOf(course)[0].route, labsOf(course)[lab - 1].route);
        tutorsConnectService.navigationAbandoned(attempt);
      });
      And("the student changes their sentiment to {string}", async (_ctx, sentiment: string) => {
        await tutorsConnectService.updateSentiment(sentiment);
        tutorsConnectService.learningEvent({});
        await settle();
      });
      Then("the reader shall have reported {number} learning events for {string}", reportedCount);
    });
  });

  Rule(
    "When a student opens a learning object, the reader shall record the page view against the learning object and the day's calendar in one database request.",
    ({ RuleScenario }) => {
      RuleScenario("A page view is one request", ({ When, Then, And }) => {
        When("the student views lab {number} of the course {number} times", viewLab);
        Then("the reader shall have made {number} page-view requests and no other learning record or calendar requests", (ctx, count: number) =>
          requests(ctx, count, "record_page_view")
        );
        And("the system shall increment the page load count for the lab to {number}", countedPageLoads);
      });
    }
  );

  Rule("While a course page is visible, the reader shall record each 30 seconds of activity in one database request.", ({ RuleScenario }) => {
    const activityRequests = (ctx: unknown, count: number) => requests(ctx, count, "record_heartbeat");
    RuleScenario("Time on a visible page is one request per 30 seconds", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the student stays on that page for {number} seconds", staysOnPage);
      Then("the reader shall have made {number} activity requests and no other learning record or calendar requests", activityRequests);
      And("the system shall record {number} more blocks of time active against the lab and against the calendar for today", recordedBlocks);
    });
    RuleScenario("Time on a hidden page is not recorded", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the page is hidden", () => vi.stubGlobal("document", { hidden: true }));
      And("the student stays on that page for {number} seconds", staysOnPage);
      Then("the reader shall have made {number} activity requests and no other learning record or calendar requests", activityRequests);
      And("the system shall record {number} more blocks of time active against the lab and against the calendar for today", recordedBlocks);
    });
  });

  // The course-reader layout starts the activity timer when it mounts and stops it when it is destroyed,
  // so a student entering and leaving the course pages is the layout's start and stop, under a fake clock.
  const coursePagesOpen = () => {
    // Installing the fake clock again would drop the intervals already on it.
    if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    tutorsConnectService.startTimer();
  };
  const coursePagesClose = () => tutorsConnectService.stopTimer();
  const spendsOnCoursePages = async (_ctx: unknown, seconds: number) => {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
    await settle();
  };
  const heartbeatRequests = (ctx: unknown, count: number) => requests(ctx, count, "record_heartbeat");
  // The timer is one per tab: a scenario that leaves it running would hold back the next scenario's start.
  AfterEachScenario(() => {
    tutorsConnectService.stopTimer();
    vi.useRealTimers();
  });

  Rule("When a student opens the course pages again in the same tab, the reader shall record each 30 seconds of activity in one database request.", ({ RuleScenario }) => {
    RuleScenario("Opening the course pages twice records one heartbeat per 30 seconds", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the course pages open", coursePagesOpen);
      And("the course pages open again", coursePagesOpen);
      And("the student spends {number} seconds on the course pages", spendsOnCoursePages);
      Then("the reader shall have made {number} activity requests and no other learning record or calendar requests", heartbeatRequests);
    });
    RuleScenario("Returning to the course pages twice records one heartbeat per 30 seconds", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the course pages open", coursePagesOpen);
      And("the course pages close", coursePagesClose);
      And("the course pages open again", coursePagesOpen);
      And("the course pages open once more", coursePagesOpen);
      And("the student spends {number} seconds on the course pages", spendsOnCoursePages);
      Then("the reader shall have made {number} activity requests and no other learning record or calendar requests", heartbeatRequests);
    });
  });

  Rule("When a student leaves the course pages, the reader shall stop recording activity for that tab.", ({ RuleScenario }) => {
    RuleScenario("No heartbeat follows leaving the course pages", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the course pages open", coursePagesOpen);
      And("the course pages open again", coursePagesOpen);
      And("the course pages close", coursePagesClose);
      And("the student spends {number} seconds on the course pages", spendsOnCoursePages);
      Then("the reader shall have made {number} activity requests and no other learning record or calendar requests", heartbeatRequests);
    });
    RuleScenario("Leaving twice is harmless and the next visit records again", ({ When, And, Then }) => {
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the course pages open", coursePagesOpen);
      And("the course pages open again", coursePagesOpen);
      And("the course pages close", coursePagesClose);
      And("the course pages close again", coursePagesClose);
      And("the course pages open once more", coursePagesOpen);
      And("the student spends {number} seconds on the course pages", spendsOnCoursePages);
      Then("the reader shall have made {number} activity requests and no other learning record or calendar requests", heartbeatRequests);
    });
  });

  Rule("If the database lacks the single-request recording functions, then the reader shall record page views and activity with the per-table requests.", ({ RuleScenario }) => {
    RuleScenario("Recording falls back before the migration is applied", ({ Given, When, And, Then }) => {
      Given("the database lacks the single-request recording functions", () => {
        recorder.missingFunctions.add("record_page_view");
        recorder.missingFunctions.add("record_heartbeat");
      });
      When("the student views lab {number} of the course {number} times", viewLab);
      And("the student stays on that page for {number} seconds", staysOnPage);
      Then("the system shall record {number} more blocks of time active against the lab and against the calendar for today", recordedBlocks);
      And("the system shall increment the page load count for the lab to {number}", countedPageLoads);
      // Both functions ship in one migration, so the first missing answer settles it for the tab.
      And("the reader shall have asked for a recording function once", () => {
        expect(recorder.rpcCalls.filter((call) => call.fn === "record_page_view" || call.fn === "record_heartbeat")).toHaveLength(1);
      });
    });
  });

  Rule(
    "When a lecturer loads a course's time report for a date range, the time dashboard shall read only that course's calendar days within the range from the database.",
    ({ RuleScenario }) => {
      let report: CourseTime;
      const seedDays = (_ctx: unknown, blocks: number, student: string, days: string) => {
        recorder.seed(
          "calendar",
          days.split(",").map((day) => ({ id: day.trim(), studentid: student, courseid: course.courseId, timeactive: blocks, pageloads: 1 }))
        );
      };
      const load = async (startDate: string | null, endDate: string | null) => {
        report = new CourseTime();
        await report.loadTime(course.courseId, startDate, endDate, course.title);
      };
      const returnedDays = (_ctx: unknown, count: number) => {
        const reads = recorder.tableCalls.filter((call) => call.table === "calendar" && call.op === "select");
        expect(reads.map((call) => call.returned)).toEqual([count]);
      };
      const coveredDays = (_ctx: unknown, days: string) => {
        expect(report.calendarModel.dates).toEqual(days.split(",").map((day) => day.trim()));
      };
      const seedStep = "the calendar holds {number} thirty-second blocks of time active for {string} on each of {string}";

      RuleScenario("A date range is read, not the whole calendar", ({ Given, When, Then, And }) => {
        Given(seedStep, seedDays);
        When("the time report for the course is loaded from {string} to {string}", (_ctx, start: string, end: string) => load(start, end));
        Then("the database shall have returned {number} calendar days for the course", returnedDays);
        And("the report shall cover the days {string}", coveredDays);
      });

      RuleScenario("A report with no range still reads the whole course", ({ Given, When, Then, And }) => {
        Given(seedStep, seedDays);
        When("the time report for the course is loaded with no date range", () => load(null, null));
        Then("the database shall have returned {number} calendar days for the course", returnedDays);
        And("the report shall cover the days {string}", coveredDays);
      });
    }
  );
});
