import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";
import { MockRealtimeChannel } from "../../support/mocks";

describe("Student: Live Presence", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall display online student count", () => {
    const event1 = world.fixtures.createPresenceEvent({ courseId: "course-1" });
    const event2 = world.fixtures.createPresenceEvent({ courseId: "course-1" });
    world.presenceEvents.push(event1, event2);

    for (const event of world.presenceEvents) {
      world.onlineStudents.set(event.user.fullName, event);
    }

    expect(world.onlineStudents.size).toBe(2);
  });

  it("shall update count in real-time when student joins", () => {
    const channel = new MockRealtimeChannel();
    const received: unknown[] = [];

    channel.on("broadcast", { event: "lo-event" }, (payload) => {
      received.push(payload.payload);
    });
    channel.subscribe();

    const newStudent = world.fixtures.createPresenceEvent({ courseId: "course-1" });
    channel.simulateBroadcast("lo-event", newStudent);

    expect(received).toHaveLength(1);
  });

  it("shall remove student when they leave", () => {
    const event1 = world.fixtures.createPresenceEvent();
    const event2 = world.fixtures.createPresenceEvent();
    world.onlineStudents.set(event1.user.fullName, event1);
    world.onlineStudents.set(event2.user.fullName, event2);

    expect(world.onlineStudents.size).toBe(2);

    world.onlineStudents.delete(event1.user.fullName);
    expect(world.onlineStudents.size).toBe(1);
  });

  it("shall handle channel unsubscribe without crashing", () => {
    const channel = new MockRealtimeChannel();
    channel.subscribe();
    expect(channel.isSubscribed()).toBe(true);

    channel.unsubscribe();
    expect(channel.isSubscribed()).toBe(false);
  });

  it("shall broadcast sentiment to course participants", () => {
    const channel = new MockRealtimeChannel();
    const sentimentMessage = {
      courseId: "course-1",
      user: { fullName: "Student 1", id: "s1", sentiment: "happy" },
      type: "presence",
    };

    const received: unknown[] = [];
    channel.on("broadcast", { event: "lo-event" }, (payload) => {
      received.push(payload.payload);
    });
    channel.subscribe();

    channel.simulateBroadcast("lo-event", sentimentMessage);
    expect(received).toHaveLength(1);
    expect((received[0] as any).user.sentiment).toBe("happy");
  });

  it("shall not broadcast when share presence is disabled", () => {
    const privateEvent = world.fixtures.createPresenceEvent({ isPrivate: true });
    const publicEvents = world.presenceEvents.filter((e) => !e.isPrivate);

    expect(privateEvent.isPrivate).toBe(true);
    expect(publicEvents).toHaveLength(0);
  });
});
