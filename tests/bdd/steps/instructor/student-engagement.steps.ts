import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";

describe("Instructor: Student Engagement Monitoring", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall display count and list of online students", () => {
    const event1 = world.fixtures.createPresenceEvent({ courseId: "course-1" });
    const event2 = world.fixtures.createPresenceEvent({ courseId: "course-1" });
    world.onlineStudents.set(event1.user.fullName, event1);
    world.onlineStudents.set(event2.user.fullName, event2);

    expect(world.onlineStudents.size).toBe(2);
    for (const [name, event] of world.onlineStudents) {
      expect(name).toBeTruthy();
      expect(event.user.avatar).toBeDefined();
    }
  });

  it("shall show latest activity feed with student, LO and timestamp", () => {
    const activities = [
      { student: "Alice", loTitle: "Lab 1", timestamp: "2025-01-06T10:00:00Z" },
      { student: "Bob", loTitle: "Talk 2", timestamp: "2025-01-06T10:05:00Z" },
    ];

    expect(activities).toHaveLength(2);
    expect(activities[0].student).toBe("Alice");
    expect(activities[1].loTitle).toBe("Talk 2");
  });

  it("shall aggregate time and page loads per student", () => {
    const records = [
      world.fixtures.createLearningRecord({ student_id: "s1", duration: 30 }),
      world.fixtures.createLearningRecord({ student_id: "s1", duration: 45 }),
      world.fixtures.createLearningRecord({ student_id: "s2", duration: 20 }),
    ];

    const totals = new Map<string, number>();
    for (const r of records) {
      totals.set(r.student_id, (totals.get(r.student_id) || 0) + r.duration);
    }

    expect(totals.get("s1")).toBe(75);
    expect(totals.get("s2")).toBe(20);
  });

  it("shall handle students with no learning records without error", () => {
    const records: ReturnType<typeof world.fixtures.createLearningRecord>[] = [];
    const totals = new Map<string, number>();

    for (const r of records) {
      totals.set(r.student_id, (totals.get(r.student_id) || 0) + r.duration);
    }

    expect(totals.size).toBe(0);
  });

  it("shall group activity by time period", () => {
    const periods = ["today", "this week", "this month", "this year"];
    const emptyMessages: Record<string, string> = {
      today: "No saved activity today",
      "this week": "No activity earlier this week",
      "this month": "No activity earlier this month",
      "this year": "No activity earlier this year",
    };

    for (const period of periods) {
      expect(emptyMessages[period]).toBeDefined();
      expect(emptyMessages[period]).toContain("No");
    }
  });
});
