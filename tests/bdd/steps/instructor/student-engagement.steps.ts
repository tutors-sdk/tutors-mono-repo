import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public env,
// SvelteKit and Auth.js. Everything between them is product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", async () => ({ env: (await import("../../support/supabase-recorder.ts")).publicEnv }));
// `$app/environment` and `$app/navigation` are aliased to one stub file, so one mock serves both.
vi.mock("$app/environment", () => ({ browser: true, goto: vi.fn() }));
vi.mock("@auth/sveltekit/client", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { freshBrowser, publishedCourse, studentOpensLab } from "../../support/connect.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { liveService } from "../../../../packages/svelte/community/src/services/live.svelte.ts";
import type { TutorsConnectLatestRow } from "../../../../packages/svelte/community/src/types.svelte.ts";
import {
  getTutorsConnectLatestLosByCourseId,
  isReceivedAtInLocalMonth,
  isReceivedAtInLocalWeek,
  isReceivedAtInLocalYear,
  isReceivedAtOnLocalDay
} from "../../../../packages/svelte/community/src/utils/supabase-client.ts";

const feature = await loadFeature("tests/bdd/features/instructor/student-engagement.feature");

type TableRow = Record<string, string>;

describeFeature(feature, ({ Background, Scenario, ScenarioOutline }) => {
  let course: Course;

  Background(({ Given }) => {
    Given("the course {string} is published with {number} labs", (_ctx, courseId: string, labCount: number) => {
      freshBrowser();
      course = publishedCourse(courseId, labCount);
    });
  });

  Scenario("View currently online students", ({ Given, When, Then, And }) => {
    Given("the instructor is viewing the live dashboard", () => liveService.startGlobalPresenceService());
    // Each student signs in to the reader and opens a lab; what reaches the dashboard is the reader's own broadcast.
    When("the students {string} connect to the course via presence", async (_ctx, names: string) => {
      for (const name of names.split(", ")) await studentOpensLab(name, course);
    });
    Then("the system shall display a count of {number} online students", (_ctx, count: number) => {
      expect(liveService.studentsOnline.value).toHaveLength(count);
    });
    And("the system shall list student names and avatars:", (_ctx, table: TableRow[]) => {
      expect(liveService.studentsOnline.value.map((lo) => ({ name: lo.user?.fullName, avatar: lo.user?.avatar }))).toEqual(table);
    });
  });

  Scenario("View latest activity feed", ({ Given, When, Then, And }) => {
    let feed: TutorsConnectLatestRow[];
    /** The reader stamps each snapshot with its own clock, so the scenario sets the clock, not the row. */
    const accessedAt = async (_ctx: unknown, name: string, lab: number, at: string) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(at));
      await studentOpensLab(name, course, lab - 1);
      vi.useRealTimers();
    };
    Given("{string} accessed lab {number} of the course at {string}", accessedAt);
    And("{string} accessed lab {number} of the course at {string}", accessedAt);
    When("the instructor loads the latest activity for the course", async () => {
      feed = await getTutorsConnectLatestLosByCourseId(course.courseId);
    });
    Then("the system shall show a feed of latest activity, most recent first", () => {
      const received = feed.map((row) => row.received_at);
      expect(received).toHaveLength(2);
      expect(received).toEqual([...received].sort().reverse());
    });
    And("each entry shall include the student name, learning object, and timestamp:", (_ctx, table: TableRow[]) => {
      const entries = feed.map((row) => {
        const payload = row.payload as { title: string; user: { fullName: string } };
        return { student: payload.user.fullName, "learning object": payload.title, timestamp: row.received_at };
      });
      expect(entries).toEqual(table);
    });
  });

  ScenarioOutline("Filter engagement by time period", ({ Given, When, Then }, variables) => {
    let viewedAt: Date;
    let received: string;
    const yesNo = (placed: boolean) => (placed ? "yes" : "no");
    // Times carry no zone, so they are local: the periods are the calendar day, Monday week, month and year of the viewer.
    Given("the live activity feed is viewed at {string}", (_ctx, at: string) => {
      viewedAt = new Date(at);
    });
    When("an activity was received at {string}", () => {
      received = variables.received;
    });
    Then("the system shall place it in today {string}, this week {string}, this month {string} and this year {string}", () => {
      expect({
        today: yesNo(isReceivedAtOnLocalDay(received, viewedAt)),
        week: yesNo(isReceivedAtInLocalWeek(received, viewedAt)),
        month: yesNo(isReceivedAtInLocalMonth(received, viewedAt)),
        year: yesNo(isReceivedAtInLocalYear(received, viewedAt))
      }).toEqual({ today: variables.today, week: variables.week, month: variables.month, year: variables.year });
    });
  });
});
