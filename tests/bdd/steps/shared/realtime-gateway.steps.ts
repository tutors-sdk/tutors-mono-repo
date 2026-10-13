import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

vi.mock("../../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({
  createClient: (await import("../../support/supabase-recorder.ts")).createClient
}));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../support/supabase-recorder.ts")).createClient }));
vi.mock("$app/env/public", async () => (await import("../../support/supabase-recorder.ts")).publicEnv);

import { createRealtimeGateway, topics, type RealtimeGateway, type Subscription, type Topic } from "../../../../packages/jsr/realtime/src/index.ts";
import { supabaseRealtimeAdapter } from "../../../../packages/svelte/realtime-supabase/src/index.ts";
import { clientOptions, recorder, type RecordingChannel } from "../../support/supabase-recorder.ts";
import { mountWhiteboardEditor } from "../../support/whiteboard-editor.ts";
import "../../../../packages/svelte/community/src/utils/supabase-client.ts";

const feature = await loadFeature("tests/bdd/features/shared/realtime-gateway.feature");

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  let gateway: RealtimeGateway;
  let subscription: Subscription;
  let joined: RecordingChannel;
  const subscriptions = new Map<string, Subscription[]>();
  const received = new Map<string, number>();
  let delays: number[] = [];

  const topic = (name: string) => topics.courseActivity(name);
  const join = (name: string) => {
    const handle = gateway.subscribe(topic(name), { onMessage: () => received.set(name, (received.get(name) ?? 0) + 1) });
    subscriptions.set(name, [...(subscriptions.get(name) ?? []), handle]);
    return handle;
  };
  /** Lets a rejoin that waits on the previous channel's removal go ahead. */
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  const sentCount = () => recorder.channels.flatMap((channel) => channel.sent).length;
  const totals = (kind: "sent" | "dropped" | "refused") => Object.values(gateway.counts()).reduce((sum, counts) => sum + counts[kind], 0);
  const publish = (count: number) => {
    for (let i = 0; i < count; i++) gateway.publish(topics.platformActivity(), "lo-event", { i });
  };
  const jitter = (_ctx: unknown, draw: number) => vi.spyOn(Math, "random").mockReturnValue(draw);
  const joinOne = (_ctx: unknown, name: string) => {
    subscription = join(name);
    joined = recorder.joined(name)[0];
  };
  const fail = (status: string) => {
    const before = vi.getTimerCount();
    const spy = vi.spyOn(globalThis, "setTimeout");
    recorder.joined(joined.name)[0]?.report(status);
    const call = spy.mock.calls.at(-1);
    if (vi.getTimerCount() > before && call) delays.push(call[1] as number);
    spy.mockRestore();
  };
  /** Each rejoin is accepted but never confirmed, so every failure is a repeat. */
  const failTimes = async (_ctx: unknown, times: number) => {
    recorder.confirmJoins = false;
    for (let i = 0; i < times; i++) {
      fail("TIMED_OUT");
      vi.advanceTimersByTime(delays.at(-1)!);
      await flush();
    }
  };
  const joinThree = () => ["course-a", "course-b", "course-c"].forEach((name) => join(name));
  const delayList = (list: string) => list.split(",").map((n) => Number(n.trim()));

  AfterEachScenario(async () => {
    await gateway.reset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  Background(({ Given }) => {
    Given("a fresh realtime gateway", () => {
      recorder.reset();
      subscriptions.clear();
      received.clear();
      delays = [];
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: new Date("2026-10-13T10:00:00Z") });
      gateway = createRealtimeGateway({ adapter: supabaseRealtimeAdapter(recorder as never) });
    });
  });

  Rule("If broadcasts are requested faster than the Realtime budget of 10 a second, then tutors shall drop the excess and count it as dropped.", ({ RuleScenario }) => {
    const sent = (_ctx: unknown, count: number) => expect(sentCount()).toBe(count);
    const dropped = (_ctx: unknown, count: number) => expect(totals("dropped")).toBe(count);
    RuleScenario("A burst of publishes sends only the budget", ({ When, Then, And }) => {
      When("{number} activity events are published within one second", (_ctx, count: number) => publish(count));
      Then("{number} broadcasts have been sent", sent);
      And("{number} broadcasts are counted as dropped", dropped);
    });
    RuleScenario("The budget refills after a second", ({ Given, When, And, Then }) => {
      Given("{number} activity events have been published within one second", (_ctx, count: number) => publish(count));
      When("{number} second passes", (_ctx, seconds: number) => vi.advanceTimersByTime(seconds * 1000));
      And("{number} activity event is published", (_ctx, count: number) => publish(count));
      Then("{number} broadcasts have been sent", sent);
    });
    RuleScenario("Sends on a joined channel share the budget", ({ Given, When, Then, And }) => {
      Given("the gateway has joined {string}", joinOne);
      When("{number} messages are sent on that channel within one second", (_ctx, count: number) => {
        for (let i = 0; i < count; i++) subscription.send("lo-event", { i });
      });
      Then("{number} broadcasts have been sent", sent);
      And("{number} broadcasts are counted as dropped", dropped);
    });
  });

  Rule(
    "When a Realtime channel reports an error or a timeout, tutors shall leave it and rejoin after a jittered exponential backoff of at most 30 seconds.",
    ({ RuleScenario }) => {
      RuleScenario("The first failure rejoins after a jittered share of 1 second", ({ Given, And, When, Then }) => {
        Given("the gateway has joined {string}", joinOne);
        And("the jitter draw is {number}", jitter);
        When("the channel reports an error", () => fail("CHANNEL_ERROR"));
        Then("the failed channel has been left", () => expect(joined.subscribed).toBe(false));
        And("{string} is rejoined after {number} milliseconds", async (_ctx, name: string, ms: number) => {
          vi.advanceTimersByTime(ms - 1);
          await flush();
          expect(recorder.joined(name)).toHaveLength(0);
          vi.advanceTimersByTime(1);
          await flush();
          expect(recorder.joined(name)).toHaveLength(1);
          expect(recorder.joined(name)[0]).not.toBe(joined);
        });
      });
      RuleScenario("Repeated failures double the delay up to 30 seconds", ({ Given, And, When, Then }) => {
        Given("the gateway has joined {string}", joinOne);
        And("the jitter draw is {number}", jitter);
        When("the channel times out {number} times in a row", failTimes);
        Then("the rejoin delays were {string} milliseconds", (_ctx, list: string) => expect(delays).toEqual(delayList(list)));
      });
      RuleScenario("A successful rejoin resets the backoff", ({ Given, And, When, Then }) => {
        Given("the gateway has joined {string}", joinOne);
        And("the jitter draw is {number}", jitter);
        When("the channel times out {number} times in a row", failTimes);
        And("the channel rejoins successfully", () => {
          recorder.confirmJoins = true;
          recorder.joined(joined.name)[0].report("SUBSCRIBED");
          expect(subscription.state()).toBe("live");
        });
        And("the channel times out {number} times in a row", (_ctx, times: number) => {
          for (let i = 0; i < times; i++) fail("TIMED_OUT");
        });
        Then("the last rejoin delay was {number} milliseconds", (_ctx, ms: number) => expect(delays.at(-1)).toBe(ms));
      });
      RuleScenario("A closed subscription is not rejoined", ({ Given, And, When, Then }) => {
        Given("the gateway has joined {string}", joinOne);
        And("the jitter draw is {number}", jitter);
        When("the channel reports an error", () => fail("CHANNEL_ERROR"));
        And("the subscription is closed", () => subscription.close());
        And("{number} seconds pass", async (_ctx, seconds: number) => {
          vi.advanceTimersByTime(seconds * 1000);
          await flush();
        });
        Then("{string} is not joined", (_ctx, name: string) => expect(recorder.joined(name)).toHaveLength(0));
      });
    }
  );

  Rule("While a Realtime channel is waiting to rejoin, tutors shall report its subscription as degraded and send nothing on it.", ({ RuleScenario }) => {
    const state = (_ctx: unknown, expected: string) => expect(subscription.state()).toBe(expected);
    RuleScenario("A failed channel is degraded", ({ Given, When, Then, And }) => {
      Given("the gateway has joined {string}", joinOne);
      When("the channel reports an error", () => fail("CHANNEL_ERROR"));
      Then("the subscription is {string}", state);
      And("a send on it is not delivered", () => {
        expect(subscription.send("lo-event", {})).toBe(false);
        expect(sentCount()).toBe(0);
      });
    });
    RuleScenario("A rejoined channel is live again", ({ Given, And, When, Then }) => {
      Given("the gateway has joined {string}", joinOne);
      And("the jitter draw is {number}", jitter);
      When("the channel reports an error", () => fail("CHANNEL_ERROR"));
      And("{number} milliseconds pass", async (_ctx, ms: number) => {
        vi.advanceTimersByTime(ms);
        await flush();
      });
      Then("the subscription is {string}", state);
      And("a send on it is delivered", () => {
        expect(subscription.send("lo-event", {})).toBe(true);
        expect(sentCount()).toBe(1);
      });
    });
  });

  Rule("If a tab requests more than 3 Realtime channels, then tutors shall refuse the extra channel and count it as refused.", ({ RuleScenario }) => {
    RuleScenario("A fourth channel is refused", ({ Given, When, Then, And }) => {
      Given("the gateway has joined {string}, {string} and {string}", joinThree);
      When("{string} is requested", (_ctx, name: string) => join(name));
      Then("{string} is not joined", (_ctx, name: string) => expect(recorder.joined(name)).toHaveLength(0));
      And("the {string} subscription is {string}", (_ctx, name: string, expected: string) => expect(subscriptions.get(name)![0].state()).toBe(expected));
      And("{number} channel is counted as refused on {string}", (_ctx, count: number, name: string) => expect(gateway.counts()[topic(name)].refused).toBe(count));
    });
    RuleScenario("Requesting a joined topic again shares its channel", ({ Given, When, Then, And }) => {
      Given("the gateway has joined {string}, {string} and {string}", joinThree);
      When("{string} is requested again", (_ctx, name: string) => join(name));
      Then("{number} channels are joined", (_ctx, count: number) => expect(recorder.channels.filter((channel) => channel.subscribed)).toHaveLength(count));
      And("both {string} subscriptions receive a message sent to it", (_ctx, name: string) => {
        recorder.relay(name, { type: "broadcast", event: "lo-event", payload: {} });
        expect(received.get(name)).toBe(2);
      });
    });
    RuleScenario("Closing a channel frees its place", ({ Given, When, Then }) => {
      Given("the gateway has joined {string}, {string} and {string}", joinThree);
      When("{string} is closed and {string} is requested", async (_ctx, closed: string, requested: string) => {
        await subscriptions.get(closed)![0].close();
        join(requested);
      });
      Then("{string} is joined", (_ctx, name: string) => expect(recorder.joined(name)).toHaveLength(1));
    });
  });

  Rule("Tutors shall count the broadcasts it sends and receives on each topic.", ({ RuleScenario }) => {
    RuleScenario("Sent and received broadcasts are counted per topic", ({ Given, When, And, Then }) => {
      Given("the gateway has joined {string}", joinOne);
      When("{number} messages are sent on that channel within one second", (_ctx, count: number) => {
        for (let i = 0; i < count; i++) subscription.send("lo-event", { i });
      });
      And("{number} messages arrive on {string}", (_ctx, count: number, name: string) => {
        for (let i = 0; i < count; i++) recorder.relay(name, { type: "broadcast", event: "lo-event", payload: { i } });
      });
      And("{number} activity event is published", (_ctx, count: number) => publish(count));
      Then("{string} counts {number} sent and {number} received", (_ctx, name: string, sent: number, got: number) => {
        expect(gateway.counts()[name as Topic]).toMatchObject({ sent, received: got });
      });
      And("{string} counts {number} sent and {number} received", (_ctx, name: string, sent: number, got: number) => {
        expect(gateway.counts()[name as Topic]).toMatchObject({ sent, received: got });
      });
    });
  });

  Rule(
    "When the Realtime connection drops, tutors shall reconnect the reader and the whiteboard editor after a jittered exponential delay of at most 30 seconds.",
    ({ RuleScenario }) => {
      const delaysFor = (reconnectAfterMs: ((tries: number) => number) | undefined, tries: number) => Array.from({ length: tries }, (_, i) => reconnectAfterMs!(i + 1));
      RuleScenario("The reader's connection backs off with jitter", ({ Given, Then }) => {
        Given("the jitter draw is {number}", jitter);
        Then("the reader's reconnect delays for {number} tries are {string} milliseconds", (_ctx, tries: number, list: string) => {
          const options = clientOptions.at(-1) as { realtime?: { reconnectAfterMs?: (tries: number) => number } };
          expect(delaysFor(options?.realtime?.reconnectAfterMs, tries)).toEqual(delayList(list));
        });
      });
      RuleScenario("The whiteboard editor's connection backs off with jitter", ({ Given, Then }) => {
        Given("the jitter draw is {number}", jitter);
        Then("the whiteboard editor's reconnect delays for {number} tries are {string} milliseconds", (_ctx, tries: number, list: string) => {
          const editor = mountWhiteboardEditor();
          expect(delaysFor(editor.clientOptions()?.realtime?.reconnectAfterMs, tries)).toEqual(delayList(list));
          editor.unmount();
        });
      });
    }
  );
});
