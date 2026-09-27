import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public env,
// SvelteKit and Auth.js. Everything between them is product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
// The time library builds its own client; locally it resolves a different copy of supabase-js, so its seam is `getSupabase`.
vi.mock("../../../../packages/jsr/time/src/services/supabase.ts", async () => ({ getSupabase: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", async () => ({ env: (await import("../../support/supabase-recorder.ts")).publicEnv }));
// `$app/environment` and `$app/navigation` are aliased to one stub file, so one mock serves both.
vi.mock("$app/environment", () => ({ browser: true, goto: vi.fn() }));
vi.mock("@auth/sveltekit/client", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { freshBrowser, githubUser, labsOf, openLo, publishedCourse, signIn } from "../../support/connect.ts";
import { recorder, settle } from "../../support/supabase-recorder.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { BaseCalendarModel } from "../../../../packages/jsr/time/src/services/base-calendar-model.ts";
import { CourseTime } from "../../../../packages/jsr/time/src/services/course-time.ts";
import { formatTimeNearestMinute } from "../../../../packages/jsr/time/src/utils/calendar-utils.ts";
import { formatDate } from "../../../../packages/svelte/community/src/utils/supabase-client.ts";
import { tutorsConnectService } from "../../../../packages/svelte/connect/src/services/connect.svelte.ts";
import { supabaseProfile } from "../../../../packages/svelte/connect/src/services/supabaseProfile.svelte.ts";
import type { CourseVisit } from "../../../../packages/svelte/connect/src/types.ts";

const feature = await loadFeature("tests/bdd/features/student/learning-progress.feature");

type TableRow = Record<string, string>;

describeFeature(feature, ({ Background, Scenario }) => {
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

  Scenario("View time spent on a course", ({ Given, When, Then, And }) => {
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

  Scenario("Record learning activity", ({ When, Then, And }) => {
    let durationBefore: number;
    When("the student views lab {number} of the course {number} times", async (_ctx, lab: number, times: number) => {
      await view(course.courseId, lab, times);
    });
    And("the student stays on that page for {number} seconds", async (_ctx, seconds: number) => {
      durationBefore = learningRecord(course.courseId, 1)!.duration as number;
      vi.useFakeTimers();
      tutorsConnectService.startTimer();
      await vi.advanceTimersByTimeAsync(seconds * 1000);
      tutorsConnectService.stopTimer();
      vi.useRealTimers();
      await settle();
    });
    Then("the system shall record {number} more blocks of time active against the lab and against the calendar for today", (_ctx, blocks: number) => {
      expect((learningRecord(course.courseId, 1)!.duration as number) - durationBefore).toBe(blocks);
      const increments = recorder.rpcCalls.filter((call) => call.fn === "increment_calendar");
      expect(increments).toHaveLength(blocks);
      for (const call of increments) {
        expect(call.args).toEqual({ field_name: "timeactive", row_id: formatDate(new Date()), student_id_value: login, course_id_value: course.courseId });
      }
    });
    And("the system shall increment the page load count for the lab to {number}", (_ctx, count: number) => {
      expect(learningRecord(course.courseId, 1)).toMatchObject({ count, type: "lab" });
      expect(recorder.rows("calendar")).toMatchObject([{ id: formatDate(new Date()), studentid: login, courseid: course.courseId, pageloads: count }]);
    });
  });

  Scenario("Resume from last accessed position", ({ Given, When, Then, And }) => {
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

  Scenario("Star a favourite course", ({ Given, When, Then, And }) => {
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

  Scenario("View learning records per learning object", ({ Given, When, Then, And }) => {
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
