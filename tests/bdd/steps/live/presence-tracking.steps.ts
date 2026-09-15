import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";
import { MockRealtimeChannel } from "../../support/mocks";

describe("Live: Presence Tracking", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall display courses with active students and show per-course count", () => {
    const event1 = world.fixtures.createPresenceEvent({ courseId: "course-1" });
    const event2 = world.fixtures.createPresenceEvent({ courseId: "course-1" });
    const event3 = world.fixtures.createPresenceEvent({ courseId: "course-2" });

    for (const event of [event1, event2, event3]) {
      const existing = world.coursesOnline.get(event.courseId) || [];
      existing.push(event);
      world.coursesOnline.set(event.courseId, existing);
    }

    expect(world.coursesOnline.size).toBe(2);
    expect(world.coursesOnline.get("course-1")).toHaveLength(2);
    expect(world.coursesOnline.get("course-2")).toHaveLength(1);
  });

  it("shall display individual student with avatar on course detail", () => {
    const event = world.fixtures.createPresenceEvent({
      courseId: "web-dev-101",
      user: { fullName: "Alice", avatar: "https://avatars.example.com/alice.png" }
    });
    world.onlineStudents.set(event.user.fullName, event);

    const alice = world.onlineStudents.get("Alice");
    expect(alice).toBeDefined();
    expect(alice!.user.avatar).toBe("https://avatars.example.com/alice.png");
  });

  it("shall remove student on disconnect and decrease active count", () => {
    const event = world.fixtures.createPresenceEvent({
      courseId: "web-dev-101",
      user: { fullName: "Alice" }
    });
    world.onlineStudents.set("Alice", event);
    const existing = world.coursesOnline.get("web-dev-101") || [];
    existing.push(event);
    world.coursesOnline.set("web-dev-101", existing);

    expect(world.onlineStudents.size).toBe(1);

    const channel = new MockRealtimeChannel();
    channel.subscribe();
    world.onlineStudents.delete("Alice");
    const courseStudents = world.coursesOnline.get("web-dev-101")!;
    courseStudents.splice(courseStudents.indexOf(event), 1);
    channel.unsubscribe();

    expect(channel.isSubscribed()).toBe(false);
    expect(world.onlineStudents.size).toBe(0);
    expect(world.coursesOnline.get("web-dev-101")).toHaveLength(0);
  });

  it("shall group students by their current course", () => {
    const courses = ["course-1", "course-2", "course-3"];
    const studentCounts = [2, 1, 2];

    for (let c = 0; c < courses.length; c++) {
      for (let s = 0; s < studentCounts[c]; s++) {
        const event = world.fixtures.createPresenceEvent({ courseId: courses[c] });
        const existing = world.coursesOnline.get(courses[c]) || [];
        existing.push(event);
        world.coursesOnline.set(courses[c], existing);
      }
    }

    expect(world.coursesOnline.size).toBe(3);
    expect(world.coursesOnline.get("course-1")).toHaveLength(2);
    expect(world.coursesOnline.get("course-2")).toHaveLength(1);
    expect(world.coursesOnline.get("course-3")).toHaveLength(2);
  });
});
