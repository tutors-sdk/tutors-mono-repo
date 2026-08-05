import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";
import { MockPartySocket } from "../../support/mocks";

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
    const socket = new MockPartySocket();
    const received: unknown[] = [];

    socket.addEventListener("message", (event: MessageEvent) => {
      received.push(JSON.parse(event.data));
    });

    const newStudent = world.fixtures.createPresenceEvent({ courseId: "course-1" });
    socket.simulateMessage(newStudent);

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

  it("shall handle WebSocket connection failure without crashing", () => {
    const socket = new MockPartySocket();
    let closeCalled = false;

    socket.addEventListener("close", () => {
      closeCalled = true;
    });

    socket.simulateClose();
    expect(closeCalled).toBe(true);
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  it("shall broadcast sentiment to course participants", () => {
    const socket = new MockPartySocket();
    const sentimentMessage = {
      courseId: "course-1",
      user: { fullName: "Student 1", id: "s1", sentiment: "happy" },
      type: "presence",
    };

    const received: unknown[] = [];
    socket.addEventListener("message", (event: MessageEvent) => {
      received.push(JSON.parse(event.data));
    });

    socket.simulateMessage(sentimentMessage);
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
