import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRealtimeGateway,
  jitteredBackoff,
  offlineAdapter,
  topics,
  type AdapterChannel,
  type ChannelStatus,
  type RealtimeAdapter,
  type RealtimeBudget,
  type Topic
} from "../../../packages/application/src/realtime/index.ts";

/**
 * The realtime gateway with a broker the test drives by hand: every channel a tab joins, what it
 * may send within its budget, and how it comes back after the broker drops it.
 */
type Joined = { topic: Topic; self: boolean; message: (event: string, payload: unknown) => void; status: (status: ChannelStatus) => void; sent: unknown[]; left: number };

function broker() {
  const joined: Joined[] = [];
  const published: Array<{ topic: Topic; event: string; payload: unknown }> = [];
  const failures = { publish: null as unknown, send: null as unknown, leave: null as unknown, throwOnSend: false };
  const adapter: RealtimeAdapter = {
    async publish(topic, event, payload) {
      if (failures.publish) throw failures.publish;
      published.push({ topic, event, payload });
    },
    join(topic, options, message, status) {
      const entry: Joined = { topic, self: options.self, message, status, sent: [], left: 0 };
      joined.push(entry);
      const channel: AdapterChannel = {
        send(event, payload) {
          if (failures.throwOnSend) throw new Error("socket closed");
          if (failures.send) return Promise.reject(failures.send);
          entry.sent.push({ event, payload });
          return Promise.resolve();
        },
        leave() {
          entry.left++;
          return failures.leave ? Promise.reject(failures.leave) : Promise.resolve();
        }
      };
      return channel;
    }
  };
  return { adapter, joined, published, failures };
}

const budget: RealtimeBudget = { eventsPerSecond: 2, maxChannels: 2, backoffBaseMs: 1000, backoffMaxMs: 4000 };
const course = topics.courseActivity("cs101");
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("the realtime gateway", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T09:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("names a course's topic by its id and the platform's by one fixed name", () => {
    expect(course).toBe("cs101");
    expect(topics.platformActivity()).toBe("tutors-all-course-access");
  });

  it("backs off further each attempt, up to the ceiling, by a random share of it", () => {
    expect(jitteredBackoff(1, budget, () => 1)).toBe(1000);
    expect(jitteredBackoff(3, budget, () => 1)).toBe(4000);
    expect(jitteredBackoff(9, budget, () => 1)).toBe(4000);
    expect(jitteredBackoff(0, budget, () => 0.5)).toBe(500);
    expect(jitteredBackoff(1)).toBeLessThanOrEqual(1000);
  });

  it("publishes within the second's budget, drops the rest and counts both", async () => {
    const { adapter, published } = broker();
    const gateway = createRealtimeGateway({ adapter, budget });
    expect([1, 2, 3].map((n) => gateway.publish(course, "lo-event", n))).toEqual([true, true, false]);
    expect(gateway.counts()).toEqual({ cs101: { sent: 2, received: 0, dropped: 1, refused: 0 } });
    vi.advanceTimersByTime(1000);
    expect(gateway.publish(course, "lo-event", 4)).toBe(true);
    await settle();
    expect(published.map((p) => p.payload)).toEqual([1, 2, 4]);
  });

  it("reports a failed publish instead of throwing it at the caller", async () => {
    const { adapter, failures } = broker();
    const onError = vi.fn();
    failures.publish = new Error("offline");
    const gateway = createRealtimeGateway({ adapter, budget, onError });
    expect(gateway.publish(course, "lo-event", 1)).toBe(true);
    await settle();
    expect(onError).toHaveBeenCalledWith("send", course, failures.publish);
  });

  it("joins a topic once for all its subscribers and hands each the events it asked for", async () => {
    const { adapter, joined } = broker();
    const gateway = createRealtimeGateway({ adapter, budget });
    const all = vi.fn();
    const moves = vi.fn();
    const first = gateway.subscribe(course, { onMessage: all }, { self: true });
    const second = gateway.subscribe(course, { onMessage: moves, events: ["move"] });
    await settle();
    expect(joined).toHaveLength(1);
    expect(joined[0]!.self).toBe(true);
    expect(first.topic).toBe(course);
    expect(first.state()).toBe("joining");

    joined[0]!.status("SUBSCRIBED");
    expect(second.state()).toBe("live");
    joined[0]!.message("lo-event", { n: 1 });
    joined[0]!.message("move", { n: 2 });
    expect(all).toHaveBeenCalledTimes(2);
    expect(moves).toHaveBeenCalledExactlyOnceWith("move", { n: 2 });
    expect(gateway.counts().cs101!.received).toBe(2);

    await first.close();
    expect(first.state()).toBe("closed");
    expect(joined[0]!.left).toBe(0);
    await second.close();
    await second.close();
    expect(joined[0]!.left).toBe(1);
    // A message from the channel that was left reaches nobody.
    joined[0]!.message("move", { n: 3 });
    joined[0]!.status("SUBSCRIBED");
    expect(moves).toHaveBeenCalledTimes(1);
  });

  it("sends on a live channel only, within the budget, and reports a send that fails either way", async () => {
    const { adapter, joined, failures } = broker();
    const onError = vi.fn();
    const gateway = createRealtimeGateway({ adapter, budget, onError });
    const subscription = gateway.subscribe(course, { onMessage: () => {} });
    await settle();
    expect(subscription.send("move", 1)).toBe(false);
    joined[0]!.status("SUBSCRIBED");
    expect(subscription.send("move", 2)).toBe(true);
    expect(joined[0]!.sent).toEqual([{ event: "move", payload: 2 }]);

    failures.send = new Error("rejected");
    expect(subscription.send("move", 3)).toBe(true);
    expect(subscription.send("move", 4)).toBe(false);
    await settle();
    expect(onError).toHaveBeenCalledWith("send", course, failures.send);

    vi.advanceTimersByTime(1000);
    failures.throwOnSend = true;
    expect(subscription.send("move", 5)).toBe(true);
    await settle();
    expect(onError).toHaveBeenLastCalledWith("send", course, expect.any(Error));

    await subscription.close();
    expect(subscription.send("move", 6)).toBe(false);
  });

  it("refuses a topic beyond the channel budget and counts the refusal", async () => {
    const { adapter, joined } = broker();
    const gateway = createRealtimeGateway({ adapter, budget });
    gateway.subscribe(topics.courseActivity("a"), { onMessage: () => {} });
    gateway.subscribe(topics.courseActivity("b"), { onMessage: () => {} });
    const third = gateway.subscribe(topics.courseActivity("c"), { onMessage: () => {} });
    await settle();
    expect(joined.map((j) => j.topic)).toEqual(["a", "b"]);
    expect(third.topic).toBe("c");
    expect(third.state()).toBe("closed");
    expect(third.send("move", 1)).toBe(false);
    await third.close();
    expect(gateway.counts().c).toEqual({ sent: 0, received: 0, dropped: 0, refused: 1 });
  });

  it("leaves a dropped channel and rejoins after a jittered wait, once, however often the broker complains", async () => {
    const { adapter, joined } = broker();
    const gateway = createRealtimeGateway({ adapter, budget, random: () => 1 });
    const subscription = gateway.subscribe(course, { onMessage: () => {} });
    await settle();
    joined[0]!.status("SUBSCRIBED");
    joined[0]!.status("CHANNEL_ERROR");
    expect(subscription.state()).toBe("degraded");
    expect(joined[0]!.left).toBe(1);
    // The replacement is not there yet; a late report from the old channel changes nothing.
    joined[0]!.status("TIMED_OUT");
    await vi.advanceTimersByTimeAsync(999);
    expect(joined).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(joined).toHaveLength(2);
    expect(subscription.state()).toBe("joining");

    // A second failure in a row waits twice as long.
    joined[1]!.status("CLOSED");
    joined[1]!.status("CLOSED");
    await vi.advanceTimersByTimeAsync(1999);
    expect(joined).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(joined).toHaveLength(3);
    joined[2]!.status("SUBSCRIBED");
    expect(subscription.state()).toBe("live");
  });

  it("does not rejoin a topic closed while it waited to come back", async () => {
    const { adapter, joined } = broker();
    const gateway = createRealtimeGateway({ adapter, budget, random: () => 1 });
    const subscription = gateway.subscribe(course, { onMessage: () => {} });
    await settle();
    joined[0]!.status("CHANNEL_ERROR");
    await subscription.close();
    await vi.advanceTimersByTimeAsync(5000);
    expect(joined).toHaveLength(1);
  });

  it("waits for a leave to finish before it joins the same topic again, and reports a leave that fails", async () => {
    const { adapter, joined, failures } = broker();
    const onError = vi.fn();
    const gateway = createRealtimeGateway({ adapter, budget, onError });
    const first = gateway.subscribe(course, { onMessage: () => {} });
    await settle();
    failures.leave = new Error("already gone");
    const closing = first.close();
    const second = gateway.subscribe(course, { onMessage: () => {} });
    expect(joined).toHaveLength(1);
    await closing;
    await settle();
    expect(onError).toHaveBeenCalledWith("leave", course, failures.leave);
    expect(joined).toHaveLength(2);
    expect(second.state()).toBe("joining");
  });

  it("reset leaves every channel, cancels a pending rejoin and clears the counts", async () => {
    const { adapter, joined } = broker();
    const gateway = createRealtimeGateway({ adapter, budget, random: () => 1 });
    const a = gateway.subscribe(topics.courseActivity("a"), { onMessage: () => {} });
    gateway.subscribe(topics.courseActivity("b"), { onMessage: () => {} });
    await settle();
    joined[0]!.status("CHANNEL_ERROR");
    gateway.publish(topics.courseActivity("a"), "lo-event", 1);
    await gateway.reset();
    expect(a.state()).toBe("closed");
    expect(joined.map((j) => j.left)).toEqual([1, 1]);
    expect(gateway.counts()).toEqual({});
    await vi.advanceTimersByTimeAsync(5000);
    expect(joined).toHaveLength(2);
    // The budget window starts again too.
    expect([1, 2].map((n) => gateway.publish(course, "lo-event", n))).toEqual([true, true]);
  });

  it("the default gateway uses the default budget and ignores failures it was given no listener for", async () => {
    const { adapter, failures } = broker();
    failures.publish = new Error("offline");
    const gateway = createRealtimeGateway({ adapter });
    expect(gateway.publish(course, "lo-event", 1)).toBe(true);
    await settle();
    expect(gateway.counts().cs101!.sent).toBe(1);
  });

  it("the offline adapter sends nothing and no channel of it goes live", async () => {
    const status = vi.fn();
    await offlineAdapter.publish(course, "lo-event", 1);
    const channel = offlineAdapter.join(course, { self: false }, () => {}, status);
    await channel.send("move", 1);
    await channel.leave();
    expect(status).not.toHaveBeenCalled();
  });
});
