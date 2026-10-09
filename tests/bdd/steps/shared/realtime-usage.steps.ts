import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({
  createClient: (await import("../../support/supabase-recorder.ts")).createClient
}));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", async () => ({ env: (await import("../../support/supabase-recorder.ts")).publicEnv }));
vi.mock("$app/env", () => ({ browser: true, goto: vi.fn() }));

import { ALL_COURSES_CHANNEL, freshBrowser, githubUser, labsOf, loEventArrives, openLo, publishedCourse, signIn } from "../../support/connect.ts";
import { recorder, type RecordingChannel } from "../../support/supabase-recorder.ts";
import { mountWhiteboardEditor } from "../../support/whiteboard-editor.ts";
import { liveService } from "../../../../packages/svelte/community/src/services/live.svelte.ts";
import { presenceService } from "../../../../packages/svelte/community/src/services/presence.svelte.ts";
import { tutorsConnectService } from "../../../../packages/svelte/connect/src/services/connect.svelte.ts";
import { tutorsId } from "../../../../packages/svelte/runes/src/index.svelte.ts";

const feature = await loadFeature("tests/bdd/features/shared/realtime-usage.feature");

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  let course: ReturnType<typeof publishedCourse>;
  let original: RecordingChannel;
  let finishRemoval: () => void;
  let restarting: Promise<void> | void;
  let whiteboard: ReturnType<typeof mountWhiteboardEditor> | undefined;
  let lastPosition = 0;
  let malformedError: unknown;
  let httpBroadcast: ReturnType<typeof vi.spyOn>;

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
  const signInWithSharing = async (_ctx: unknown, name: string, sharing: string) => {
    await signIn(githubUser(name));
    if (sharing === "disabled") tutorsConnectService.toggleShare();
  };

  AfterEachScenario(() => {
    whiteboard?.unmount();
    whiteboard = undefined;
    liveService.stopGlobalPresenceService();
    presenceService.stopPresenceListener();
    if (liveService.channelCourse) void recorder.removeChannel(liveService.channelCourse as unknown as RecordingChannel);
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  Background(({ Given }) => {
    Given("a fresh activity session", () => {
      freshBrowser();
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
    RuleScenario("Repeating global publisher setup creates one publish-only channel", ({ When, Then }) => {
      When("the global publisher is prepared {number} times", (_ctx, count: number) => {
        for (let i = 0; i < count; i++) presenceService.connectToAllCourseAccess();
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
        expect(recorder.joined(ALL_COURSES_CHANNEL)).toHaveLength(1);
        expect(recorder.joined(ALL_COURSES_CHANNEL)[0]).not.toBe(original);
      });
    });
  });

  Rule("When whiteboard cursor updates arrive, the reader shall coalesce them into at most one broadcast every 50 milliseconds.", ({ RuleScenario }) => {
    RuleScenario("A cursor burst sends its final position", ({ Given, When, Then, And }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      When("{number} cursor positions arrive within {number} milliseconds", (_ctx, count: number, elapsed: number) => {
        for (let i = 1; i <= count; i++) cursor(i);
        vi.advanceTimersByTime(elapsed);
      });
      Then("no cursor broadcast has been sent", () => expect(whiteboard!.channel.send).not.toHaveBeenCalled());
      And("at {number} milliseconds one broadcast carries the final position", (_ctx, at: number) => {
        vi.advanceTimersByTime(at - 49);
        expect(whiteboard!.channel.send).toHaveBeenCalledTimes(1);
        finalPosition();
      });
    });
    RuleScenario("Continuous pointer movement sends at most 20 broadcasts per second", ({ Given, When, Then, And }) => {
      Given("a subscribed whiteboard editor", () => mountEditor(true));
      When("the cursor moves every millisecond for {number} milliseconds", (_ctx, elapsed: number) => {
        for (let i = 1; i <= elapsed; i++) {
          cursor(i);
          vi.advanceTimersByTime(1);
        }
      });
      Then("{number} cursor broadcasts have been sent", (_ctx, count: number) => expect(whiteboard!.channel.send).toHaveBeenCalledTimes(count));
      And("the final broadcast carries the final position", finalPosition);
    });
  });

  Rule("While its whiteboard channel is disconnected, the reader shall suppress cursor broadcasts.", ({ RuleScenario }) => {
    const moveAndWait = () => {
      cursor(1);
      vi.advanceTimersByTime(50);
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
        vi.advanceTimersByTime(50);
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

  Rule("While a student has disabled activity sharing, the reader shall hold no course activity subscription.", ({ RuleScenario }) => {
    RuleScenario("Entering a course with sharing disabled opens no subscription", ({ Given, When, Then }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      When("the student enters the course", enterCourse);
      Then("no course channel remains subscribed", noCourseChannel);
    });
    RuleScenario("Disabling sharing closes an existing course subscription", ({ Given, And, When, Then }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      And("the student has entered the course", enterCourse);
      When("the student disables sharing", () => tutorsConnectService.toggleShare());
      Then("no course channel remains subscribed", noCourseChannel);
    });
    RuleScenario("Enabling sharing opens the course subscription", ({ Given, And, When, Then }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      And("the student has entered the course", enterCourse);
      When("the student enables sharing", () => tutorsConnectService.toggleShare());
      Then("only {string} remains subscribed", onlyCourse);
    });
  });

  Rule("When a student shares course activity, the reader shall update its own activity locally without requesting a broadcast echo.", ({ RuleScenario }) => {
    RuleScenario("Sharing a learning event does not require a server echo", ({ Given, When, Then, And }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      When("the student enters the course", enterCourse);
      Then("the course channel does not request broadcast echoes", () => expect(recorder.joined(course.courseId)[0].options.config?.broadcast?.self).toBe(false));
      And("{string} appears once in the course activity list", (_ctx, name: string) => {
        expect(presenceService.studentsOnline.value.map((lo) => lo.user?.fullName)).toEqual([name]);
        expect(tutorsId.value?.share).toBe("true");
      });
    });
    RuleScenario("Activity is published while a course channel is closing", ({ Given, And, When, Then }) => {
      Given("{string} is signed in with sharing {word}", signInWithSharing);
      And("the student has entered the course", async () => {
        await enterCourse();
        original = recorder.joined(course.courseId)[0];
        httpBroadcast = vi.spyOn(original, "httpSend");
      });
      And("removing that channel is pending", delayRemoval);
      When("the course is left and reopened and activity is reported before removal finishes", () => {
        presenceService.stopPresenceListener();
        restarting = presenceService.startPresenceListener(course.courseId);
        presenceService.sendLoEvent(course, labsOf(course)[0], tutorsId.value!);
      });
      Then("the course activity is published through HTTP", () => {
        expect(httpBroadcast).toHaveBeenCalledWith("lo-event", expect.objectContaining({ courseId: course.courseId }));
        expect(presenceService.studentsOnline.value.map((lo) => lo.user?.fullName)).toEqual(["Alice"]);
      });
      And("completing removal creates one replacement subscription", async () => {
        finishRemoval();
        await restarting;
        expect(recorder.joined(course.courseId)).toHaveLength(1);
        expect(recorder.joined(course.courseId)[0]).not.toBe(original);
      });
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
        vi.advanceTimersByTime(100);
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
          vi.advanceTimersByTime(100);
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
});
