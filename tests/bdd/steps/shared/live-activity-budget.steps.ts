import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
vi.mock("$app/env/private", async () => (await import("../../support/supabase-recorder.ts")).privateEnv);

// The seams: Supabase (by the path product code resolves, and by name for a hoisted install), the public env
// and SvelteKit. Everything between them is product code, the reader's server route included.
vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({
  createClient: (await import("../../support/supabase-recorder.ts")).createClient
}));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$app/env/public", async () => (await import("../../support/supabase-recorder.ts")).publicEnv);
vi.mock("$app/env", () => ({ browser: true, goto: vi.fn() }));

import {
  ALL_COURSES_CHANNEL,
  freshBrowser,
  githubUser,
  labsOf,
  liveActivityStored,
  liveWatcher,
  onlineListLoads,
  openLo,
  postToReaderServer,
  publishedCourse,
  readerServer,
  signIn,
  storedActivity
} from "../../support/connect.ts";
import { publicEnv, recorder, settle } from "../../support/supabase-recorder.ts";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { liveService } from "../../../../packages/svelte/community/src/services/live.svelte.ts";
import { presenceService } from "../../../../packages/svelte/community/src/services/presence.svelte.ts";
import { realtime } from "../../../../packages/svelte/community/src/services/realtime.ts";
import type { LoRecord } from "../../../../packages/svelte/community/src/types.svelte.ts";
import { tutorsConnectService } from "../../../../packages/svelte/connect/src/services/connect.svelte.ts";

const feature = await loadFeature("tests/bdd/features/shared/live-activity-budget.feature");

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  let course: Course;
  let answer: { status: number; answer: unknown } | undefined;
  /** Which page of Tutors Live the scenario has open: the platform feed (home) or a course page. */
  let shown: "platform" | "course" = "platform";
  let watchers = 0;

  /** A learning event as the reader's browser builds it, for a client that posts directly. */
  const learningEvent = (name: string): Record<string, unknown> => {
    const user = githubUser(name);
    const lo = labsOf(course)[0];
    return {
      courseId: course.courseId,
      courseUrl: course.courseUrl,
      courseTitle: course.title,
      title: lo.title,
      loRoute: lo.route,
      type: lo.type,
      isPrivate: false,
      user: { fullName: user.name, avatar: user.image, id: user.login, sentiment: user.sentiment }
    };
  };
  const broadcastsFor = (topic: string, name: string) => recorder.sentOn(topic).filter((message) => (message.payload as LoRecord).user?.fullName === name);

  const watching = (topic: () => string) => () => liveWatcher(topic(), `live-tab-${++watchers}`);
  const signedIn = async (_ctx: unknown, name: string, sharing: string) => {
    await signIn(githubUser(name));
    if (sharing === "disabled") tutorsConnectService.toggleShare();
  };
  const opensLab = (_ctx: unknown, n: number) => openLo(course, labsOf(course)[n - 1]);
  const courseFeedHas = (_ctx: unknown, count: number, name: string) => expect(broadcastsFor(course.courseId, name)).toHaveLength(count);
  const platformFeedHas = (_ctx: unknown, count: number, name: string) => expect(broadcastsFor(ALL_COURSES_CHANNEL, name)).toHaveLength(count);
  const spendIs = (_ctx: unknown, messages: number) => expect(recorder.liveSpent()).toBe(messages);
  const spent = (_ctx: unknown, sent: number, budget: number) => {
    expect(recorder.liveSettings.live_daily_budget).toBe(budget);
    recorder.spendLive(sent);
  };
  const showsPlatform = async () => {
    shown = "platform";
    await liveService.startGlobalPresenceService();
    await settle();
  };
  const showsCourse = async (_ctx: unknown, courseId: string) => {
    shown = "course";
    await presenceService.startPresenceListener(courseId);
    await settle();
  };
  const secondsPass = async (_ctx: unknown, seconds: number) => {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
    await settle();
  };
  const reported = (_ctx: unknown, topic: string, count: number) =>
    expect(recorder.rpcCalls.filter((call) => call.fn === "realtime_watch" && call.args.p_topic === topic)).toHaveLength(count);
  const wasActive = (_ctx: unknown, name: string, minutesAgo: number) => storedActivity(name, course, labsOf(course)[0], minutesAgo);
  const listed = () => (shown === "platform" ? liveService.studentsOnline.value : presenceService.studentsOnline.value).map((lo) => lo.user?.fullName);
  const readTimes = (_ctx: unknown, count: number) => expect(onlineListLoads()).toBe(count);
  const answers = (_ctx: unknown, status: number) => expect(answer?.status).toBe(status);
  const sendsFor = async (_ctx: unknown, name: string) => {
    answer = await postToReaderServer(JSON.stringify(learningEvent(name)));
  };

  AfterEachScenario(() => {
    liveService.stopGlobalPresenceService();
    presenceService.stopPresenceListener();
    publicEnv.PUBLIC_ANON_MODE = "FALSE";
    vi.useRealTimers();
  });

  Background(({ Given }) => {
    Given("the course {string} is published with {number} labs", (_ctx, courseId: string, labCount: number) => {
      freshBrowser();
      // Watchers age and the dashboard reports on an interval; timeouts stay real so fire-and-forget promises settle.
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], now: new Date("2026-10-14T10:00:00Z") });
      course = publishedCourse(courseId, labCount);
      answer = undefined;
      watchers = 0;
      shown = "platform";
    });
  });

  Rule(
    "When a student opens a learning object, the reader shall send the learning event to the reader's server without publishing it over Realtime from the browser.",
    ({ RuleScenario }) => {
      RuleScenario("A page view is stored and sent to the reader's server", ({ Given, And, When, Then }) => {
        Given("a live dashboard is watching the course feed", watching(() => course.courseId));
        And("{string} is signed in with sharing {word}", signedIn);
        When("the student opens lab {number}", opensLab);
        Then("the reader's server has received {number} learning event for {string}", (_ctx, count: number, name: string) => {
          const received = readerServer.posts.filter((post) => (post.body as LoRecord).user?.fullName === name);
          expect(received).toHaveLength(count);
          expect(received[0].body).toMatchObject({ courseId: course.courseId, loRoute: labsOf(course)[0].route });
          expect(received[0].status).toBe(202);
        });
        And("the learning event of {string} is stored for Tutors Live", (_ctx, name: string) => {
          expect(liveActivityStored(name)).toEqual([expect.objectContaining({ courseId: course.courseId, loRoute: labsOf(course)[0].route })]);
        });
        // The tab's gateway counts every broadcast the browser makes; the server's publish is not one of them.
        And("the browser has published nothing over Realtime", () => {
          const sent = Object.values(realtime.counts()).reduce((total, counts) => total + counts.sent + counts.dropped, 0);
          expect(sent).toBe(0);
          expect(recorder.channels.filter((channel) => channel.subscribed)).toEqual([]);
        });
      });
    }
  );

  Rule("When the reader's server receives a learning event, the reader shall publish it only to the activity feeds a live dashboard has watched in the last 90 seconds.", ({ RuleScenario }) => {
    RuleScenario("Nobody watching publishes nothing", ({ Given, When, Then, And }) => {
      Given("{string} is signed in with sharing {word}", signedIn);
      When("the student opens lab {number}", opensLab);
      Then("the course feed has {number} broadcasts for {string}", courseFeedHas);
      And("the platform feed has {number} broadcasts for {string}", platformFeedHas);
      And("the day's Live spend is {number} messages", spendIs);
    });
    RuleScenario("A watched course feed receives the event", ({ Given, And, When, Then }) => {
      Given("a live dashboard is watching the course feed", watching(() => course.courseId));
      And("{string} is signed in with sharing {word}", signedIn);
      When("the student opens lab {number}", opensLab);
      Then("the course feed has {number} broadcasts for {string}", courseFeedHas);
      And("the platform feed has {number} broadcasts for {string}", platformFeedHas);
    });
    RuleScenario("Both feeds watched receive the event, each charged with its watchers", ({ Given, And, When, Then }) => {
      Given("a live dashboard is watching the course feed", watching(() => course.courseId));
      And("another live dashboard is watching the course feed", watching(() => course.courseId));
      And("a live dashboard is watching the platform feed", watching(() => ALL_COURSES_CHANNEL));
      And("{string} is signed in with sharing {word}", signedIn);
      When("the student opens lab {number}", opensLab);
      Then("the course feed has {number} broadcasts for {string}", courseFeedHas);
      And("the platform feed has {number} broadcasts for {string}", platformFeedHas);
      // (1 + 2 course watchers) + (1 + 1 platform watcher)
      And("the day's Live spend is {number} messages", spendIs);
    });
    RuleScenario("A dashboard not heard from for more than 90 seconds no longer counts", ({ Given, And, When, Then }) => {
      Given("a live dashboard last reported watching the course feed {number} seconds ago", (_ctx, seconds: number) => liveWatcher(course.courseId, "live-tab", seconds));
      And("{string} is signed in with sharing {word}", signedIn);
      When("the student opens lab {number}", opensLab);
      Then("the course feed has {number} broadcasts for {string}", courseFeedHas);
    });
  });

  Rule("While at least 70% of the day's Live Realtime budget is spent, the reader shall publish learning events to the course feed only.", ({ RuleScenario }) => {
    const scenario = (title: string) =>
      RuleScenario(title, ({ Given, And, When, Then }) => {
        Given("{number} of the day's {number} Live messages are spent", spent);
        And("a live dashboard is watching the course feed", watching(() => course.courseId));
        And("a live dashboard is watching the platform feed", watching(() => ALL_COURSES_CHANNEL));
        And("{string} is signed in with sharing {word}", signedIn);
        When("the student opens lab {number}", opensLab);
        Then("the course feed has {number} broadcasts for {string}", courseFeedHas);
        And("the platform feed has {number} broadcasts for {string}", platformFeedHas);
      });
    scenario("At 70% the platform feed stops");
    scenario("Below 70% both feeds receive the event");
  });

  Rule("While at least 90% of the day's Live Realtime budget is spent, the reader shall publish no learning events.", ({ RuleScenario }) => {
    RuleScenario("At 90% nothing is published or charged", ({ Given, And, When, Then }) => {
      Given("{number} of the day's {number} Live messages are spent", spent);
      And("a live dashboard is watching the course feed", watching(() => course.courseId));
      And("a live dashboard is watching the platform feed", watching(() => ALL_COURSES_CHANNEL));
      And("{string} is signed in with sharing {word}", signedIn);
      When("the student opens lab {number}", opensLab);
      Then("the course feed has {number} broadcasts for {string}", courseFeedHas);
      And("the platform feed has {number} broadcasts for {string}", platformFeedHas);
      And("the day's Live spend is {number} messages", spendIs);
    });
    RuleScenario("Below 90% the course feed still receives the event", ({ Given, And, When, Then }) => {
      Given("{number} of the day's {number} Live messages are spent", spent);
      And("a live dashboard is watching the course feed", watching(() => course.courseId));
      And("{string} is signed in with sharing {word}", signedIn);
      When("the student opens lab {number}", opensLab);
      Then("the course feed has {number} broadcasts for {string}", courseFeedHas);
    });
  });

  Rule("While it shows a course or the platform feed, the live dashboard shall report itself as a watcher of that feed every 60 seconds.", ({ RuleScenario }) => {
    const watcherCount = (_ctx: unknown, topic: string, count: number) => expect(recorder.rows("realtime_watchers").filter((row) => row.topic === topic)).toHaveLength(count);
    RuleScenario("The platform feed is reported on opening and every minute", ({ Given, When, Then, And }) => {
      Given("the live dashboard shows the platform feed", showsPlatform);
      When("{number} seconds pass", secondsPass);
      Then("the live dashboard has reported watching {string} {number} times", reported);
      And("{string} has {number} watcher", watcherCount);
    });
    RuleScenario("A course page is reported on opening and every minute", ({ Given, When, Then, And }) => {
      Given("the live dashboard shows the course {string}", showsCourse);
      When("{number} seconds pass", secondsPass);
      Then("the live dashboard has reported watching {string} {number} times", reported);
      And("{string} has {number} watcher", watcherCount);
    });
    RuleScenario("A dashboard that is closed stops reporting", ({ Given, When, And, Then }) => {
      Given("the live dashboard shows the platform feed", showsPlatform);
      When("the live dashboard is closed", () => liveService.stopGlobalPresenceService());
      And("{number} seconds pass", secondsPass);
      Then("the live dashboard has reported watching {string} {number} times", reported);
    });
  });

  Rule("If the day's Live Realtime budget is paused or the watcher report fails, then the live dashboard shall read stored activity every 60 seconds.", ({ RuleScenario }) => {
    const lists = (_ctx: unknown, name: string) => expect(listed()).toEqual([name]);
    RuleScenario("A paused budget shows activity from the database", ({ Given, And, When, Then }) => {
      Given("{number} of the day's {number} Live messages are spent", spent);
      And("the live dashboard shows the platform feed", showsPlatform);
      And("{string} was active in the course {number} minutes ago", wasActive);
      When("{number} seconds pass", secondsPass);
      Then("the live dashboard lists {string}", lists);
      And("the stored activity has been read {number} times", readTimes);
    });
    RuleScenario("A failed watcher report shows activity from the database", ({ Given, And, When, Then }) => {
      Given("the watcher report is not available", () => recorder.missingFunctions.add("realtime_watch"));
      And("the live dashboard shows the course {string}", showsCourse);
      And("{string} was active in the course {number} minutes ago", wasActive);
      When("{number} seconds pass", secondsPass);
      Then("the live dashboard lists {string}", lists);
      And("the stored activity has been read {number} times", readTimes);
    });
    RuleScenario("A dashboard within budget does not read stored activity", ({ Given, And, When, Then }) => {
      Given("the live dashboard shows the platform feed", showsPlatform);
      And("{string} was active in the course {number} minutes ago", wasActive);
      When("{number} seconds pass", secondsPass);
      Then("the live dashboard lists nobody", () => expect(listed()).toEqual([]));
      And("the stored activity has been read {number} times", readTimes);
    });
  });

  Rule(
    "If a learning event sent to the reader's server is larger than 4 KB, lacks a course or student id, or has a field over 1000 characters, then the reader shall reject it with status 400.",
    ({ RuleScenarioOutline }) => {
      RuleScenarioOutline("A malformed learning event is rejected and not published", ({ Given, When, Then, And }, variables) => {
        Given("a live dashboard is watching the course feed", watching(() => course.courseId));
        When("a client sends the reader's server a learning event with {string}", async () => {
          const fault = String(variables.fault);
          const event = learningEvent("Alice");
          const faults: Record<string, () => string> = {
            "no course id": () => JSON.stringify({ ...event, courseId: undefined }),
            "no student id": () => JSON.stringify({ ...event, user: { ...(event.user as object), id: "" } }),
            "a 1001 letter title": () => JSON.stringify({ ...event, title: "x".repeat(1001) }),
            "a 5000 byte body": () => JSON.stringify({ ...event, img: "x".repeat(5000 - JSON.stringify(event).length) }),
            "a body that is not JSON": () => "{ not json"
          };
          answer = await postToReaderServer(faults[fault]());
        });
        Then("the reader's server answers with status {number}", answers);
        And("the course feed has {number} broadcasts for {string}", courseFeedHas);
      });
    }
  );

  Rule("If the reader's server cannot claim the day's Live budget, then the reader shall publish nothing for the learning event.", ({ RuleScenario }) => {
    RuleScenario("The budget function is missing", ({ Given, And, When, Then }) => {
      Given("a live dashboard is watching the course feed", watching(() => course.courseId));
      And("the Live budget claim is not available", () => recorder.missingFunctions.add("realtime_claim_live_publish"));
      And("{string} is signed in with sharing {word}", signedIn);
      When("the student opens lab {number}", opensLab);
      Then("the course feed has {number} broadcasts for {string}", courseFeedHas);
      And("the reader's server answered {string} with status {number}", (_ctx, name: string, status: number) => {
        const posts = readerServer.posts.filter((post) => (post.body as LoRecord).user?.fullName === name);
        expect(posts.map((post) => post.status)).toEqual([status]);
        expect(posts[0].answer).toEqual({ tier: null, topics: [] });
      });
    });
  });

  Rule("Where anonymous mode is enabled, the reader shall accept learning events at its server without publishing them.", ({ RuleScenario }) => {
    RuleScenario("An anonymous deployment publishes nothing", ({ Given, And, When, Then }) => {
      Given("a live dashboard is watching the course feed", watching(() => course.courseId));
      And("the reader runs in anonymous mode", () => {
        publicEnv.PUBLIC_ANON_MODE = "TRUE";
      });
      When("a client sends the reader's server a learning event for {string}", sendsFor);
      Then("the reader's server answers with status {number}", answers);
      And("the course feed has {number} broadcasts for {string}", courseFeedHas);
    });
    RuleScenario("A signed-in deployment publishes the event", ({ Given, When, Then, And }) => {
      Given("a live dashboard is watching the course feed", watching(() => course.courseId));
      When("a client sends the reader's server a learning event for {string}", sendsFor);
      Then("the reader's server answers with status {number}", answers);
      And("the course feed has {number} broadcasts for {string}", courseFeedHas);
    });
  });
});
