import { describe, it, expect, vi } from "vitest";
import { MockRealtimeChannel } from "../../bdd/support/mocks";

describe("presence-service: simulateBroadcast delivers to handlers", () => {
  it("delivers a broadcast to a registered handler", () => {
    const channel = new MockRealtimeChannel();
    const received: unknown[] = [];

    channel.on("broadcast", { event: "lo-event" }, (payload) => {
      received.push(payload.payload);
    });
    channel.subscribe();

    channel.simulateBroadcast("lo-event", { user: "alice", action: "join" });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ user: "alice", action: "join" });
  });

  it("delivers to multiple registered handlers", () => {
    const channel = new MockRealtimeChannel();
    const callCount = { a: 0, b: 0 };

    channel.on("broadcast", { event: "lo-event" }, () => { callCount.a++; });
    channel.on("broadcast", { event: "lo-event" }, () => { callCount.b++; });
    channel.subscribe();

    channel.simulateBroadcast("lo-event", { ping: true });
    expect(callCount.a).toBe(1);
    expect(callCount.b).toBe(1);
  });
});

describe("presence-service: subscribe and unsubscribe", () => {
  it("starts unsubscribed", () => {
    const channel = new MockRealtimeChannel();
    expect(channel.isSubscribed()).toBe(false);
  });

  it("subscribe sets subscribed state", () => {
    const channel = new MockRealtimeChannel();
    channel.subscribe();
    expect(channel.isSubscribed()).toBe(true);
  });

  it("subscribe fires callback with SUBSCRIBED", () => {
    const channel = new MockRealtimeChannel();
    const callback = vi.fn();

    channel.subscribe(callback);
    expect(callback).toHaveBeenCalledWith("SUBSCRIBED");
  });

  it("unsubscribe clears subscribed state", () => {
    const channel = new MockRealtimeChannel();
    channel.subscribe();
    channel.unsubscribe();
    expect(channel.isSubscribed()).toBe(false);
  });
});

describe("presence-service: event filtering", () => {
  it("only delivers to handlers matching the event name", () => {
    const channel = new MockRealtimeChannel();
    const loEvents: unknown[] = [];
    const otherEvents: unknown[] = [];

    channel.on("broadcast", { event: "lo-event" }, (p) => { loEvents.push(p.payload); });
    channel.on("broadcast", { event: "other" }, (p) => { otherEvents.push(p.payload); });
    channel.subscribe();

    channel.simulateBroadcast("lo-event", { data: "first" });
    expect(loEvents).toHaveLength(1);
    expect(otherEvents).toHaveLength(0);
  });
});

describe("presence-service: send", () => {
  it("send() accepts broadcast message without error", () => {
    const channel = new MockRealtimeChannel();
    channel.subscribe();
    expect(() => channel.send({ type: "broadcast", event: "lo-event", payload: { test: true } })).not.toThrow();
  });
});
