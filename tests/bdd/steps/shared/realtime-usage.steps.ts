import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
vi.mock("$app/env/private", async () => (await import("../../support/supabase-recorder.ts")).privateEnv);

vi.mock("../../../../packages/adapters/driven/store-supabase/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({
  createClient: (await import("../../support/supabase-recorder.ts")).createClient
}));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$app/env/public", async () => (await import("../../support/supabase-recorder.ts")).publicEnv);
vi.mock("$app/env", () => ({ browser: true, goto: vi.fn() }));

import { ALL_COURSES_CHANNEL, freshBrowser, githubUser, labsOf, liveWatcher, loEventArrives, onlineListLoads, openLo, publishedCourse, signIn, storedActivity } from "../../support/connect.ts";
import { recorder, settle, type RecordingChannel } from "../../support/supabase-recorder.ts";
import { mountWhiteboardEditor } from "../../support/whiteboard-editor.ts";
import { liveService } from "../../../../packages/adapters/driving/svelte-state/src/community/services/live.svelte.ts";
import { presenceService } from "../../../../packages/adapters/driving/svelte-state/src/community/services/presence.svelte.ts";
import { tutorsConnectService } from "../../../../packages/adapters/driving/svelte-state/src/connect/services/connect.svelte.ts";
import { tutorsId } from "../../../../packages/adapters/driving/svelte-state/src/index.svelte.ts";

const feature = await loadFeature("tests/bdd/features/shared/realtime-usage.feature");

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  let course: ReturnType<typeof publishedCourse>;
  let original: RecordingChannel;
  let finishRemoval: () => void;
  let restarting: Promise<void> | void;
  let whiteboard: ReturnType<typeof mountWhiteboardEditor> | undefined;
  let lastPosition = 0;
  let malformedError: unknown;

  const monitor = async (_ctx: unknown, courseId: string) => {
    await presenceService.startPresenceListener(courseId);
  };
  const report = (_ctx: unknown, name: string) => loEventArrives(course.courseId, name, course, labsOf(course)[0]);
  const noCourseChannel = () => expect(recorder.joined(course.courseId)).toHaveLength(0);
  const onlyCourse = (_ctx: unknown, courseId: string) => {
    expect(recorder.channels.filter((channel) => channel.subscribed).map((channel) => channel.name)).toEqual([courseId]);
  };
  const enterCourse = () => openLo(course, labsOf(course)[0]);
  const cursor = (position: number) => {
    lastPosition = position;
    whiteboard!.editor.onPointerUpdate({ pointer: { x: position, y: position }, button: "up" });
  };
  const mountEditor = (subscribed: boolean) => {
    vi.useFakeTimers();
    whiteboard = mountWhiteboardEditor();
    if (subscribed) {
      whiteboard.status("SUBSCRIBED");
      whiteboard.participants(2);
    }
  };
  const moveContinuously = (_ctx: unknown, elapsed: number) => {
    for (let i = 1; i <= elapsed; i++) {
      cursor(i);
      vi.advanceTimersByTime(1);
    }
  };
  const sent = (event: string) => whiteboard!.channel.send.mock.calls.filter(([message]) => message.event === event);
  const cursorBroadcasts = (_ctx: unknown, count: number) => expect(sent("cursor-update")).toHaveLength(count);
  const roomOf = (_ctx: unknown, count: number) => whiteboard!.participants(count);
  const finalPosition = () =>
    expect(whiteboard!.channel.send.mock.lastCall?.[0]).toMatchObject({
      event: "cursor-update",
      payload: { pointer: { x: lastPosition, y: lastPosition }, button: "up" }
    });
  const delayRemoval = () => {
    const remove = recorder.removeChannel.bind(recorder);
    vi.spyOn(recorder, "removeChannel").mockImplementationOnce(
      (channel) =>
        new Promise<string>((resolve) => {
          finishRemoval = () => {
            void remove(channel);
            resolve("ok");
          };
        })
    );
  };
  const onlineNames = () => presenceService.studentsOnline.value.map((lo) => lo.user?.fullName).sort();
  const onlineListIs = (_ctx: unknown, list: string) => expect(onlineNames()).toEqual(list.split(", ").sort());
  const wasActive = (_ctx: unknown, name: string, minutesAgo: number) => storedActivity(name, course, labsOf(course)[0], minutesAgo);
  const secondsPass = async (_ctx: unknown, seconds: number) => {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
    await settle();
  };
  const loadedTimes = (_ctx: unknown, count: number) => expect(onlineListLoads()).toBe(count);
  const signInWithSharing = async (_ctx: unknown, name: string, sharing: string) => {
    await signIn(githubUser(name));
    if (sharing === "disabled") tutorsConnectService.toggleShare();
  };

  AfterEachScenario(() => {
    whiteboard?.unmount();
    whiteboard = undefined;
    liveService.stopGlobalPresenceService();
    presenceService.stopPresenceListener();
    liveService.stopCoursePresenceListener();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  Background(({ Given }) => {
    Given("a fresh activity session", () => {
      freshBrowser();
      // The online list refreshes on an interval and ages rows by the clock; timeouts stay real so
      // fire-and-forget product promises still settle.
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], now: new Date("2026-10-13T10:00:00Z") });
      course = publishedCourse("web-dev-101");
    });
  });

  Rule("When an activity channel is requested again for the same scope, tutors shall reuse its existing channel.", ({ RuleScenario }) => {
    RuleScenario("Repeating a reader course subscription preserves its activity", ({ Given, And, When, Then }) => {
      Given("course activity is monitored for {string}", async (ctx, courseId: string) => {
        await monitor(ctx, courseId);
        original = recorder.joined(courseId)[0];
      });
      And("{string} has reported activity in that course", report);
      When("monitoring is requested again for {string}", monitor);
      Then("the original course channel remains subscribed", () => {
        expect(recorder.joined(course.courseId)).toEqual([original]);
        expect(original.subscriptions).toBe(1);
      });
      And("{string} remains in the course activity list", (_ctx, name: string) => {
        expect(presenceService.studentsOnline.value.map((lo) => lo.user?.fullName)).toEqual([name]);
      });
    });
    RuleScenario("Repeating a live course subscription preserves its channel", ({ Given, When, Then }) => {
      Given("the live service monitors {string}", (_ctx, courseId: string) => {
        liveService.startCoursePresenceListener(courseId);
        original = recorder.joined(courseId)[0];
      });
      When("the live service is asked to monitor {string} again", (_ctx, courseId: string) => liveService.startCoursePresenceListener(courseId));
      Then("the original live course channel remains subscribed", () => expect(recorder.joined(course.courseId)).toEqual([original]));
    });
    // The reader's server publishes for the browser, and only to a feed a Live tab is watching.
    RuleScenario("Repeated global publishing reuses one publish-only channel", ({ Given, When, Then }) => {
      Given("a live dashboard is watching the platform feed", () => liveWatcher(ALL_COURSES_CHANNEL, "live-tab"));
      When("course activity is published {number} times", async (_ctx, count: number) => {
        for (let i = 0; i < count; i++) presenceService.sendLoEvent(course, labsOf(course)[0], githubUser("Alice"));
        await settle();
        expect(recorder.sentOn(ALL_COURSES_CHANNEL)).toHaveLength(count);
      });
      Then("one global channel exists without a subscription", () => {
        expect(recorder.channels.filter((channel) => channel.name === ALL_COURSES_CHANNEL)).toHaveLength(1);
        expect(recorder.joined(ALL_COURSES_CHANNEL)).toHaveLength(0);
      });
    });
  });

  Rule("When an activity view is left, tutors shall stop its Realtime subscription.", ({ RuleScenario }) => {
    RuleScenario("Leaving a course stops delivery and clears its activity", ({ Given, And, When, Then }) => {
      Given("course activity is monitored for {string}", monitor);
      And("{string} has reported activity in that course", report);
      When("the course activity view is left", () => presenceService.stopPresenceListener());
      And("{string} reports activity in that course", report);
      Then("no course channel remains subscribed", noCourseChannel);
      And("the course activity list is empty", () => expect(presenceService.studentsOnline.value).toEqual([]));
    });
    RuleScenario("Switching courses removes the previous subscription", ({ Given, When, Then }) => {
      Given("course activity is monitored for {string}", monitor);
      When("monitoring is requested for {string}", monitor);
      Then("only {string} remains subscribed", onlyCourse);
    });
    RuleScenario("Leaving the global dashboard stops platform-wide delivery", ({ Given, When, Then, And }) => {
      Given("the global dashboard is monitoring activity", () => liveService.startGlobalPresenceService());
      When("the global dashboard is left", () => liveService.stopGlobalPresenceService());
      Then("no global channel remains subscribed", () => expect(recorder.joined(ALL_COURSES_CHANNEL)).toHaveLength(0));
      And("returning to the dashboard creates one global subscription", async () => {
        await liveService.startGlobalPresenceService();
        expect(recorder.joined(ALL_COURSES_CHANNEL)).toHaveLength(1);
      });
    });
    RuleScenario("Returning to a course waits for its closing channel", ({ Given, And, When, Then }) => {
      Given("course activity is monitored for {string}", async (ctx, courseId: string) => {
        await monitor(ctx, courseId);
        original = recorder.joined(courseId)[0];
      });
      And("removing that channel is pending", delayRemoval);
      When("the course view is left and reopened before removal finishes", () => {
        presenceService.stopPresenceListener();
        restarting = presenceService.startPresenceListener(course.courseId);
      });
      Then("the closing channel is not subscribed again", () => expect(original.subscriptions).toBe(1));
      And("completing removal creates one replacement subscription", async () => {
        finishRemoval();
        await restarting;
        // The replacement joins once the removal it waits on has settled.
        await settle();
        expect(recorder.joined(course.courseId)).toHaveLength(1);
        expect(recorder.joined(course.courseId)[0]).not.toBe(original);
      });
    });
    RuleScenario("Returning to the global dashboard waits for its closing channel", ({ Given, And, When, Then }) => {
      Given("the global dashboard is monitoring activity", async () => {
        await liveService.startGlobalPresenceService();
        original = recorder.joined(ALL_COURSES_CHANNEL)[0];
      });
      And("removing that channel is pending", delayRemoval);
      When("the dashboard is left and reopened before removal finishes", () => {
        liveService.stopGlobalPresenceService();
        restarting = liveService.startGlobalPresenceService();
      });
      Then("the closing channel is not subscribed again", () => expect(original.subscriptions).toBe(1));
      And("completing removal creates one replacement global subscription", async () => {
        finishRemoval();
        await restarting;
        // The replacement joins once the removal it waits on has settled.
        await settle();
        expect(recorder.joined(ALL_COURSES_CHANNEL)).toHaveLength(1);
        expect(recorder.joined(ALL_COURSES_CHANNEL)[0]).not.toBe(original);
      });
    });
  });

  Rule("When whiteboard cursor updates arrive, the reader shall coalesce them into at most one broadcast per cursor interval.", ({ RuleScenario }) => {
    RuleScenario("A cursor burst sends its final position", ({ Given, When, Then, And }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      When("{number} cursor positions arrive within {number} milliseconds", (_ctx, count: number, elapsed: number) => {
        for (let i = 1; i <= count; i++) cursor(i);
        vi.advanceTimersByTime(elapsed);
      });
      Then("no cursor broadcast has been sent", () => expect(whiteboard!.channel.send).not.toHaveBeenCalled());
      And("at {number} milliseconds one broadcast carries the final position", (_ctx, at: number) => {
        vi.advanceTimersByTime(at - 99);
        expect(whiteboard!.channel.send).toHaveBeenCalledTimes(1);
        finalPosition();
      });
    });
    RuleScenario("Continuous pointer movement in a small room sends at most 10 broadcasts per second", ({ Given, When, Then, And }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      When("the cursor moves every millisecond for {number} milliseconds", moveContinuously);
      Then("{number} cursor broadcasts have been sent", cursorBroadcasts);
      And("the final broadcast carries the final position", finalPosition);
    });
  });

  Rule("While its whiteboard channel is disconnected, the reader shall suppress cursor broadcasts.", ({ RuleScenario }) => {
    const moveAndWait = () => {
      cursor(1);
      vi.advanceTimersByTime(100);
    };
    const noCursor = () => expect(whiteboard!.channel.send).not.toHaveBeenCalled();
    RuleScenario("Cursor movement before subscription sends no broadcast", ({ Given, When, Then }) => {
      Given("a whiteboard editor awaiting subscription", () => mountEditor(false));
      When("the cursor moves and {number} milliseconds elapse", moveAndWait);
      Then("no cursor broadcast has been sent", noCursor);
    });
    RuleScenario("A disconnect cancels delivery of a queued cursor position", ({ Given, When, Then }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      When("a cursor position is queued and the channel disconnects", () => {
        cursor(1);
        whiteboard!.status("CHANNEL_ERROR");
        vi.advanceTimersByTime(100);
      });
      Then("no cursor broadcast has been sent", noCursor);
    });
    RuleScenario("Cursor movement after subscription sends a broadcast", ({ Given, When, Then }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      When("the cursor moves and {number} milliseconds elapse", moveAndWait);
      Then("one cursor broadcast has been sent", () => expect(whiteboard!.channel.send).toHaveBeenCalledTimes(1));
    });
  });

  Rule("When a whiteboard editor unmounts, the reader shall release its channel and pending broadcast timers.", ({ RuleScenario }) => {
    RuleScenario("Editor cleanup cancels queued scene and cursor broadcasts", ({ Given, When, And, Then }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      When("a scene change and a cursor position are queued", () => {
        whiteboard!.editor.onChange([{ id: "shape-1", version: 1 }]);
        cursor(1);
      });
      And("the editor unmounts before the timers run", () => {
        whiteboard!.unmount();
        vi.advanceTimersByTime(100);
      });
      Then("the editor channel has been removed", () => expect(whiteboard!.supabase.removeChannel).toHaveBeenCalledWith(whiteboard!.channel));
      And("no queued broadcast or scene notification is sent", () => {
        expect(whiteboard!.channel.send).not.toHaveBeenCalled();
        expect(whiteboard!.postMessage).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      });
    });
  });

  Rule("If a course activity message has no student identity, then tutors shall ignore the message.", ({ RuleScenario }) => {
    RuleScenario("An activity message without a user is ignored", ({ Given, When, Then }) => {
      Given("course activity is monitored for {string}", monitor);
      When("an activity message without a user arrives", () => {
        malformedError = undefined;
        try {
          recorder.relay(course.courseId, { type: "broadcast", event: "lo-event", payload: { courseId: course.courseId } });
        } catch (error) {
          malformedError = error;
        }
      });
      Then("no student activity is added", () => {
        expect(malformedError).toBeUndefined();
        expect(presenceService.studentsOnline.value).toEqual([]);
      });
    });
  });

  Rule("While a student has disabled activity sharing, the reader shall not load the course online list.", ({ RuleScenario }) => {
    RuleScenario("Entering a course with sharing disabled loads no online list", ({ Given, When, Then, And }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      When("the student enters the course", enterCourse);
      Then("the online list has not been loaded", () => expect(onlineListLoads()).toBe(0));
      And("no course channel remains subscribed", noCourseChannel);
    });
    RuleScenario("Disabling sharing stops refreshing the online list", ({ Given, And, When, Then }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      And("the student has entered the course", enterCourse);
      When("the student disables sharing", () => tutorsConnectService.toggleShare());
      And("{number} seconds pass", secondsPass);
      Then("the online list has been loaded {number} time", loadedTimes);
      And("the course activity list is empty", () => expect(presenceService.studentsOnline.value).toEqual([]));
    });
    RuleScenario("Enabling sharing loads the online list", ({ Given, And, When, Then }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      And("the student has entered the course", enterCourse);
      When("the student enables sharing", async () => {
        tutorsConnectService.toggleShare();
        await settle();
      });
      Then("the online list has been loaded {number} time", loadedTimes);
      And("no course channel remains subscribed", noCourseChannel);
    });
  });

  Rule("When a student shares course activity, the reader shall add it to the student's own online list without waiting for a broadcast.", ({ RuleScenario }) => {
    RuleScenario("Sharing a learning event updates the student's own list", ({ Given, When, Then, And }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      When("the student enters the course", enterCourse);
      Then("{string} appears once in the course activity list", (_ctx, name: string) => {
        expect(presenceService.studentsOnline.value.map((lo) => lo.user?.fullName)).toEqual([name]);
        expect(tutorsId.value?.share).toBe("true");
      });
      And("no course channel remains subscribed", noCourseChannel);
    });
  });

  Rule("While a whiteboard has no other participant, the reader shall save local edits without sending collaboration broadcasts.", ({ RuleScenario }) => {
    const queueUpdates = () => {
      whiteboard!.editor.onChange([{ id: "shape-1", version: 1 }]);
      cursor(1);
    };
    const elapse = (_ctx: unknown, duration: number) => vi.advanceTimersByTime(duration);
    const saves = () =>
      expect(whiteboard!.postMessage).toHaveBeenCalledWith(
        {
          type: "scene-changed",
          elements: [{ id: "shape-1", version: 1 }]
        },
        "https://reader.invalid"
      );
    const noBroadcast = () => expect(whiteboard!.channel.send).not.toHaveBeenCalled();
    RuleScenario("A solo whiteboard saves edits without broadcasting", ({ Given, And, When, Then }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      And("only this editor is present in the room", () => whiteboard!.participants(1));
      When("a scene change and a cursor position are queued", queueUpdates);
      And("{number} milliseconds elapse", elapse);
      Then("the scene is sent to the parent for saving", saves);
      And("no collaboration broadcast is sent", noBroadcast);
    });
    RuleScenario("A cursor queued before the last peer leaves is not broadcast", ({ Given, When, And, Then }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      When("a cursor position is queued and the last peer leaves", () => {
        cursor(1);
        whiteboard!.participants(1);
      });
      And("{number} milliseconds elapse", elapse);
      Then("no collaboration broadcast is sent", noBroadcast);
    });
    RuleScenario("A second tab of the same user receives collaboration updates", ({ Given, And, When, Then }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      And("another tab of the same user is present in the room", () => whiteboard!.participants(2, true));
      When("a scene change and a cursor position are queued", queueUpdates);
      And("{number} milliseconds elapse", elapse);
      Then("a scene broadcast and a cursor broadcast are sent", () => {
        expect(whiteboard!.channel.send.mock.calls.map(([message]) => message.event)).toEqual(["cursor-update", "scene-update"]);
      });
      And("the scene is sent to the parent for saving", saves);
    });
  });
  Rule("When a whiteboard peer becomes visible in Presence, the reader shall broadcast scene deltas suppressed while the editor was alone.", ({ RuleScenario }) => {
    const alone = () => {
      mountEditor(true);
      whiteboard!.participants(1);
    };
    const peerArrives = () => whiteboard!.participants(2);
    const noDuplicate = () => {
      peerArrives();
      expect(whiteboard!.channel.send).toHaveBeenCalledTimes(1);
    };
    RuleScenario("An edit is replayed when a peer's delayed Presence update arrives", ({ Given, And, When, Then }) => {
      Given("a subscribed whiteboard editor with no visible peer", alone);
      And("a scene edit has been saved without broadcasting", () => {
        whiteboard!.editor.onChange([{ id: "shape-1", version: 1 }]);
        vi.advanceTimersByTime(250);
        expect(whiteboard!.postMessage).toHaveBeenCalledWith({ type: "scene-changed", elements: [{ id: "shape-1", version: 1 }] }, "https://reader.invalid");
        expect(whiteboard!.channel.send).not.toHaveBeenCalled();
      });
      When("another editor becomes visible in Presence", peerArrives);
      Then("one scene broadcast contains the skipped edit", () => {
        expect(whiteboard!.channel.send).toHaveBeenCalledExactlyOnceWith({
          type: "broadcast",
          event: "scene-update",
          payload: { elements: [{ id: "shape-1", version: 1 }] }
        });
      });
      And("another Presence sync sends no duplicate scene broadcast", noDuplicate);
    });
    RuleScenario("Several solo edits replay the latest version and deletion together", ({ Given, And, When, Then }) => {
      Given("a subscribed whiteboard editor with no visible peer", alone);
      And("an element is edited twice and another is deleted while alone", () => {
        for (const elements of [
          [
            { id: "shape-1", version: 1 },
            { id: "shape-2", version: 1 }
          ],
          [
            { id: "shape-1", version: 2 },
            { id: "shape-2", version: 1 }
          ],
          [
            { id: "shape-1", version: 2 },
            { id: "shape-2", version: 2, isDeleted: true }
          ]
        ]) {
          whiteboard!.editor.onChange(elements);
          vi.advanceTimersByTime(250);
        }
        expect(whiteboard!.channel.send).not.toHaveBeenCalled();
      });
      When("another editor becomes visible in Presence", peerArrives);
      Then("one scene broadcast contains the latest edit and deletion", () => {
        expect(whiteboard!.channel.send).toHaveBeenCalledExactlyOnceWith({
          type: "broadcast",
          event: "scene-update",
          payload: {
            elements: [
              { id: "shape-1", version: 2 },
              { id: "shape-2", version: 2, isDeleted: true }
            ]
          }
        });
      });
      And("another Presence sync sends no duplicate scene broadcast", noDuplicate);
    });
  });

  Rule(
    "When the whiteboard Presence count changes, the reader shall set the cursor interval to 100 milliseconds for up to 3 participants, 250 milliseconds for up to 6 and 500 milliseconds for up to 8.",
    ({ RuleScenario }) => {
      for (const title of ["Three participants share cursors 10 times a second", "Six participants share cursors 4 times a second"]) {
        RuleScenario(title, ({ Given, And, When, Then }) => {
          Given("a subscribed whiteboard editor", () => mountEditor(true));
          And("{number} participants are present in the room", roomOf);
          When("the cursor moves every millisecond for {number} milliseconds", moveContinuously);
          Then("{number} cursor broadcasts have been sent", cursorBroadcasts);
        });
      }
      RuleScenario("A cursor queued before the room grows waits for the longer interval", ({ Given, And, When, Then }) => {
        Given("a subscribed whiteboard editor", () => mountEditor(true));
        And("{number} participants are present in the room", roomOf);
        When("a cursor position is queued and the room grows to {number} participants", (_ctx, count: number) => {
          cursor(1);
          whiteboard!.participants(count);
        });
        And("{number} milliseconds elapse", (_ctx, duration: number) => vi.advanceTimersByTime(duration));
        Then("no cursor broadcast has been sent", () => expect(sent("cursor-update")).toHaveLength(0));
        And("at {number} milliseconds one broadcast carries the final position", () => {
          vi.advanceTimersByTime(1);
          expect(sent("cursor-update")).toHaveLength(1);
          finalPosition();
        });
      });
      RuleScenario("Eight participants share cursors twice a second", ({ Given, And, When, Then }) => {
        Given("a subscribed whiteboard editor", () => mountEditor(true));
        And("{number} participants are present in the room", roomOf);
        When("the cursor moves every millisecond for {number} milliseconds", moveContinuously);
        Then("{number} cursor broadcasts have been sent", cursorBroadcasts);
        And("the final broadcast carries the final position", finalPosition);
      });
    }
  );

  Rule("While a whiteboard room has more than 8 participants, the reader shall not send cursor broadcasts.", ({ RuleScenario }) => {
    RuleScenario("A crowded room shares no cursors", ({ Given, And, When, Then }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      And("{number} participants are present in the room", roomOf);
      When("the cursor moves every millisecond for {number} milliseconds", moveContinuously);
      Then("no cursor broadcast has been sent", () => expect(sent("cursor-update")).toHaveLength(0));
    });
    RuleScenario("A crowded room still shares scene edits", ({ Given, And, When, Then }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      And("{number} participants are present in the room", roomOf);
      When("a scene change and a cursor position are queued", () => {
        whiteboard!.editor.onChange([{ id: "shape-1", version: 1 }]);
        cursor(1);
      });
      And("{number} milliseconds elapse", (_ctx, duration: number) => vi.advanceTimersByTime(duration));
      Then("only a scene broadcast is sent", () => {
        expect(whiteboard!.channel.send.mock.calls.map(([message]) => message.event)).toEqual(["scene-update"]);
      });
    });
    RuleScenario("Cursors resume when the room shrinks to 8", ({ Given, And, When, Then }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      And("{number} participants are present in the room", roomOf);
      And("the room shrinks to {number} participants", roomOf);
      When("the cursor moves every millisecond for {number} milliseconds", moveContinuously);
      Then("{number} cursor broadcasts have been sent", cursorBroadcasts);
    });
  });

  Rule(
    "If the pointer has moved less than 4 pixels with an unchanged button since the last cursor broadcast, then the reader shall not send a cursor broadcast.",
    ({ RuleScenario }) => {
      const point = (x: number, y: number, button = "up") => whiteboard!.editor.onPointerUpdate({ pointer: { x, y }, button });
      const broadcastAt = (_ctx: unknown, x: number, y: number) => {
        point(x, y);
        vi.advanceTimersByTime(100);
        expect(sent("cursor-update")).toHaveLength(1);
      };
      const moveTo = (_ctx: unknown, x: number, y: number, elapsed: number) => {
        point(x, y);
        vi.advanceTimersByTime(elapsed);
      };
      RuleScenario("A pointer jitter is not broadcast", ({ Given, And, When, Then }) => {
        Given("a subscribed whiteboard editor", () => mountEditor(true));
        And("a cursor broadcast has been sent at {number}, {number}", broadcastAt);
        When("the pointer moves to {number}, {number} and {number} milliseconds elapse", moveTo);
        Then("{number} cursor broadcasts have been sent", cursorBroadcasts);
      });
      RuleScenario("A press without movement is broadcast", ({ Given, And, When, Then }) => {
        Given("a subscribed whiteboard editor", () => mountEditor(true));
        And("a cursor broadcast has been sent at {number}, {number}", broadcastAt);
        When("the pointer is pressed at {number}, {number} and {number} milliseconds elapse", (_ctx, x: number, y: number, elapsed: number) => {
          point(x, y, "down");
          vi.advanceTimersByTime(elapsed);
        });
        Then("{number} cursor broadcasts have been sent", cursorBroadcasts);
      });
      RuleScenario("A 4 pixel move is broadcast", ({ Given, And, When, Then }) => {
        Given("a subscribed whiteboard editor", () => mountEditor(true));
        And("a cursor broadcast has been sent at {number}, {number}", broadcastAt);
        When("the pointer moves to {number}, {number} and {number} milliseconds elapse", moveTo);
        Then("{number} cursor broadcasts have been sent", cursorBroadcasts);
      });
    }
  );

  Rule("When a whiteboard scene changes, the reader shall send the accumulated changes at most once every 250 milliseconds.", ({ RuleScenario }) => {
    const scenes = () => sent("scene-update");
    RuleScenario("A single edit is sent after 250 milliseconds", ({ Given, When, And, Then }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      When("a scene change is made", () => whiteboard!.editor.onChange([{ id: "shape-1", version: 1 }]));
      And("{number} milliseconds elapse", (_ctx, duration: number) => vi.advanceTimersByTime(duration));
      Then("no collaboration broadcast is sent", () => expect(whiteboard!.channel.send).not.toHaveBeenCalled());
      And("at {number} milliseconds one scene broadcast carries the edit", () => {
        vi.advanceTimersByTime(1);
        expect(scenes()).toEqual([[{ type: "broadcast", event: "scene-update", payload: { elements: [{ id: "shape-1", version: 1 }] } }]]);
      });
    });
    RuleScenario("A continuous drag sends 4 scene broadcasts a second with the latest version", ({ Given, When, Then, And }) => {
      let version = 0;
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      When("an element is dragged every {number} milliseconds for {number} milliseconds", (_ctx, every: number, elapsed: number) => {
        for (let at = 0; at < elapsed; at += every) {
          whiteboard!.editor.onChange([{ id: "shape-1", version: ++version }]);
          vi.advanceTimersByTime(every);
        }
        // Let the last batch go out once the drag stops.
        vi.advanceTimersByTime(250);
      });
      Then("{number} scene broadcasts have been sent", (_ctx, count: number) => expect(scenes()).toHaveLength(count));
      And("the scene is saved {number} times", (_ctx, count: number) => {
        expect(whiteboard!.postMessage.mock.calls.filter(([message]) => message.type === "scene-changed")).toHaveLength(count);
      });
      And("the final scene broadcast carries the latest version", () => {
        expect(scenes().at(-1)![0].payload).toEqual({ elements: [{ id: "shape-1", version }] });
      });
    });
  });

  Rule(
    "When a sharing student enters a course, the reader shall load the course online list from stored activity without joining a course Realtime channel.",
    ({ RuleScenario }) => {
      RuleScenario("Entering a course lists classmates from stored activity", ({ Given, And, When, Then }) => {
        Given("{string} was active in the course {number} minutes ago", wasActive);
        And("{string} is signed in with sharing {word}", signInWithSharing);
        When("the student enters the course", enterCourse);
        Then("the online list is {string}", onlineListIs);
        And("no course channel remains subscribed", noCourseChannel);
      });
      RuleScenario("The student's activity is published to the course without joining it", ({ Given, When, Then, And }) => {
        Given("a live dashboard is watching the course feed", () => liveWatcher(course.courseId, "live-tab"));
        And("{string} is signed in with sharing {word}", signInWithSharing);
        When("the student enters the course", enterCourse);
        Then("the course activity is published through HTTP", () => {
          const published = recorder.sentOn(course.courseId).map((message) => message.payload as { courseId?: string; user?: { fullName?: string } });
          expect(published).toEqual([expect.objectContaining({ courseId: course.courseId, user: expect.objectContaining({ fullName: "Alice" }) })]);
        });
        And("no course channel remains subscribed", noCourseChannel);
      });
    }
  );

  Rule("While the course tab is visible, the reader shall refresh the course online list every 60 seconds.", ({ RuleScenario }) => {
    RuleScenario("A classmate who arrives appears on the next refresh", ({ Given, And, When, Then }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      And("the student has entered the course", enterCourse);
      And("{string} was active in the course {number} minutes ago", wasActive);
      When("{number} seconds pass", secondsPass);
      Then("the online list is {string}", onlineListIs);
      And("the online list has been loaded {number} times", loadedTimes);
    });
    RuleScenario("A hidden tab does not refresh the online list", ({ Given, And, When, Then }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      And("the student has entered the course", enterCourse);
      And("the course tab is hidden", () => vi.stubGlobal("document", { hidden: true }));
      And("{string} was active in the course {number} minutes ago", wasActive);
      When("{number} seconds pass", secondsPass);
      Then("the online list is {string}", onlineListIs);
      And("the online list has been loaded {number} time", loadedTimes);
    });
  });

  Rule("When the course online list is loaded, the reader shall list the student and the classmates whose activity was stored in the last 5 minutes.", ({ RuleScenario }) => {
    RuleScenario("A classmate inactive for more than 5 minutes is not listed", ({ Given, And, When, Then }) => {
      Given("{string} was active in the course {number} minutes ago", wasActive);
      And("{string} was active in the course {number} minutes ago", wasActive);
      And("{string} is signed in with sharing {word}", signInWithSharing);
      When("the student enters the course", enterCourse);
      Then("the online list is {string}", onlineListIs);
    });
    RuleScenario("A classmate who leaves drops off while the student stays listed", ({ Given, And, When, Then }) => {
      Given("{string} was active in the course {number} minutes ago", wasActive);
      And("{string} is signed in with sharing {word}", signInWithSharing);
      When("the student enters the course", enterCourse);
      And("{number} seconds pass", secondsPass);
      Then("the online list is {string}", onlineListIs);
      And("the online list has been loaded {number} times", loadedTimes);
    });
  });
  Rule("If the course online list cannot be loaded, then the reader shall keep the last loaded list.", ({ RuleScenario }) => {
    RuleScenario("A failed refresh keeps classmates listed", ({ Given, And, When, Then }) => {
      Given("{string} was active in the course {number} minutes ago", wasActive);
      And("{string} is signed in with sharing {word}", signInWithSharing);
      And("the student has entered the course", enterCourse);
      And("the stored activity cannot be read", () => recorder.tableErrors.set("tutors-connect-latest", { message: "connection reset" }));
      When("{number} seconds pass", secondsPass);
      Then("the online list is {string}", onlineListIs);
    });
  });
});
