import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public env,
// SvelteKit and the identity adapter. Everything between them is product code.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$app/env/public", async () => (await import("../../support/supabase-recorder.ts")).publicEnv);
// `$app/env` and `$app/navigation` are aliased to one stub file, so one mock serves both.
vi.mock("$app/env", () => ({ browser: true, goto: vi.fn() }));

import { ALL_COURSES_CHANNEL, freshBrowser, githubUser, labsOf, liveWatcher, loEventArrives, openLo, readerServer, publishedCourse, signIn, storedActivity } from "../../support/connect.ts";
import { recorder, settle } from "../../support/supabase-recorder.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { presenceService } from "../../../../packages/svelte/community/src/services/presence.svelte.ts";
import type { LoRecord } from "../../../../packages/svelte/community/src/types.svelte.ts";
import { tutorsConnectService } from "../../../../packages/svelte/connect/src/services/connect.svelte.ts";

const feature = await loadFeature("tests/bdd/features/student/live-presence.feature");

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  let course: Course;

  const lab = (n: number) => labsOf(course)[n - 1];
  const online = () => presenceService.studentsOnline.value;
  const card = (name: string) => online().find((lo) => lo.user?.fullName === name);
  const names = () => online().map((lo) => lo.user?.fullName);
  /** Every lo-event broadcast for this browser's activity (by the reader's server), on the course channel and the all-courses channel. */
  const broadcasts = () => [...recorder.sentOn(course.courseId), ...recorder.sentOn(ALL_COURSES_CHANNEL)].map((message) => message.payload as LoRecord);
  const opens = (_ctx: unknown, _name: string, n: number) => openLo(course, lab(n));
  /** Another student's browser stores their activity, and the reader's next 60-second refresh reads it. */
  const arrives = async (name: string, n: number) => {
    storedActivity(name, course, lab(n), 0);
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
  };

  AfterEachScenario(() => {
    presenceService.stopPresenceListener();
    vi.useRealTimers();
  });

  Background(({ Given, And }) => {
    Given("the course {string} is published with {number} labs", (_ctx, courseId: string, labCount: number) => {
      freshBrowser();
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      course = publishedCourse(courseId, labCount);
    });
    And("the student {string} is signed in", (_ctx, name: string) => signIn(githubUser(name)));
    // The reader's server publishes only to watched feeds, so what reaches other participants is observable.
    And("a live dashboard is watching the course and the platform feeds", () => {
      liveWatcher(course.courseId, "live-tab-1");
      liveWatcher(ALL_COURSES_CHANNEL, "live-tab-2");
    });
  });

  Rule("When students open a course, the reader shall show the number of students online on it.", ({ RuleScenario }) => {
    RuleScenario("See online students count", ({ Given, When, Then }) => {
      Given("{string} has opened lab {number} of the course", opens);
      When("{string} and {string} view lab {number} of the course", async (_ctx, first: string, second: string, n: number) => {
        storedActivity(first, course, lab(n), 0);
        await arrives(second, n);
      });
      Then("the system shall display {number} students currently online", (_ctx, count: number) => {
        expect(online()).toHaveLength(count);
        expect(presenceService.listeningTo).toBe(course.courseId);
      });
    });
  });

  Rule("When another student joins a course or moves within it, the reader shall update the online list, the count and the learning object shown for that student.", ({ RuleScenario }) => {
    RuleScenario("Receive presence updates", ({ Given, When, Then, And }) => {
      Given("{string} has opened lab {number} of the course", opens);
      When("another student {string} joins the course at lab {number}", (_ctx, name: string, n: number) => arrives(name, n));
      Then("the system shall update the online count to {number}", (_ctx, count: number) => {
        expect(online()).toHaveLength(count);
      });
      And("the online list shall be {string}", (_ctx, list: string) => {
        expect(names()).toEqual(list.split(", "));
      });
      And("when {string} moves on to lab {number} the online count shall stay at {number} and show {string} at {string}", async (_ctx, name: string, n: number, count: number, who: string, title: string) => {
        await arrives(name, n);
        expect(online()).toHaveLength(count);
        expect(card(who)).toMatchObject({ title, loRoute: lab(n).route });
      });
    });
  });

  Rule("When a student sets their sentiment, the reader shall store it and broadcast it to the other participants of the course.", ({ RuleScenario }) => {
    RuleScenario("Express sentiment", ({ Given, When, Then, And }) => {
      Given("{string} has opened lab {number} of the course", opens);
      When("the student sets their sentiment to {string}", (_ctx, sentiment: string) => tutorsConnectService.updateSentiment(sentiment));
      And("the student moves on to lab {number}", (_ctx, n: number) => openLo(course, lab(n)));
      Then("the system shall store the sentiment {string} for {string}", (_ctx, sentiment: string, login: string) => {
        expect(recorder.rows("tutors-connect-users")).toMatchObject([{ github_id: login, sentiment }]);
      });
      And("the system shall broadcast the sentiment {string} to other course participants", (_ctx, sentiment: string) => {
        const afterChange = broadcasts().filter((payload) => payload.loRoute === lab(2).route);
        // Once on the course channel, once on the all-courses channel the live app listens to.
        expect(afterChange.map((payload) => payload.user?.sentiment)).toEqual([sentiment, sentiment]);
      });
      And("the sentiment {string} shall be on the presence card of {string}", (_ctx, sentiment: string, name: string) => {
        expect(card(name)?.user?.sentiment).toBe(sentiment);
      });
    });
  });

  Rule("If a student has turned off sharing their presence, then the reader shall mark the student offline and broadcast none of their activity.", ({ RuleScenario }) => {
    RuleScenario("Private mode hides presence", ({ Given, When, Then, And }) => {
      Given("the student has disabled share presence", async () => {
        tutorsConnectService.toggleShare();
        await settle();
      });
      When("{string} opens lab {number} of the course", opens);
      Then("the system shall mark {string} as {string}", (_ctx, login: string, status: string) => {
        expect(recorder.rows("tutors-connect-users")).toMatchObject([{ github_id: login, online_status: status }]);
      });
      And("the system shall not broadcast their activity to others", () => {
        expect(broadcasts()).toEqual([]);
        expect(readerServer.posts).toEqual([]);
        expect(recorder.rows("tutors-connect-latest")).toEqual([]);
      });
      And("their name shall not appear in the online list", () => {
        // Activity controls are hidden while sharing is disabled, so there is no reader to deliver to.
        expect(presenceService.listeningTo).toBe("");
        expect(recorder.joined(course.courseId)).toHaveLength(0);
        expect(names()).toEqual([]);
      });
    });
  });

  Rule("If a learning event is published for a course the student is not reading, then the reader shall not receive it.", ({ RuleScenario }) => {
    RuleScenario("Events from another course never reach the reader", ({ Given, When, Then, And }) => {
      Given("{string} has opened lab {number} of the course", opens);
      When("a learning event for the course {string} is published platform-wide", (_ctx, otherCourseId: string) => {
        const other = publishedCourse(otherCourseId, 1);
        loEventArrives(ALL_COURSES_CHANNEL, "Bob", other, labsOf(other)[0]);
      });
      Then("the online list shall be {string}", (_ctx, list: string) => {
        expect(names()).toEqual(list.split(", "));
      });
      // The guard itself: the reader never joins the platform channel (its server only publishes to it), so the
      // platform's events are not delivered to it and Supabase is not billed for delivering them.
      And("the reader shall hold no joined platform-wide channel", () => {
        expect(recorder.joined(ALL_COURSES_CHANNEL)).toEqual([]);
      });
    });

    RuleScenario("The reader still publishes platform-wide for the live dashboard", ({ Given, Then }) => {
      Given("{string} has opened lab {number} of the course", opens);
      Then("the platform-wide channel shall carry {number} event for {string}", (_ctx, count: number, name: string) => {
        const published = recorder.sentOn(ALL_COURSES_CHANNEL).map((message) => message.payload as LoRecord);
        expect(published.filter((payload) => payload.user?.fullName === name)).toHaveLength(count);
      });
    });
  });
});
