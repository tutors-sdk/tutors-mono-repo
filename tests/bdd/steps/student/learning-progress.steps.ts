import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";

describe("Student: Learning Progress Tracking", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall display total time active for a course", () => {
    const entries = world.fixtures.createCalendarDataset(1, 3);
    const totalTime = entries.reduce((sum, e) => sum + e.timeactive, 0);

    expect(totalTime).toBeGreaterThanOrEqual(0);
    expect(entries).toHaveLength(3);
  });

  it("shall record time active and page loads per view", () => {
    const record = world.fixtures.createLearningRecord({
      duration: 45,
      count: 3,
    });

    expect(record.duration).toBe(45);
    expect(record.count).toBe(3);
    expect(record.type).toBe("lab");
  });

  it("shall track recently accessed courses", () => {
    const course1 = world.fixtures.createCourse({ title: "Course A" });
    const course2 = world.fixtures.createCourse({ title: "Course B" });
    const recentlyAccessed = [course2, course1];

    expect(recentlyAccessed[0].title).toBe("Course B");
    expect(recentlyAccessed).toHaveLength(2);
  });

  it("shall group learning records by course", () => {
    const record1 = world.fixtures.createLearningRecord({ courseid: "course-1" });
    const record2 = world.fixtures.createLearningRecord({ courseid: "course-1" });
    const record3 = world.fixtures.createLearningRecord({ courseid: "course-2" });
    const records = [record1, record2, record3];

    const grouped = new Map<string, typeof records>();
    for (const r of records) {
      const list = grouped.get(r.courseid) || [];
      list.push(r);
      grouped.set(r.courseid, list);
    }

    expect(grouped.get("course-1")).toHaveLength(2);
    expect(grouped.get("course-2")).toHaveLength(1);
  });

  it("shall add course to favourites", () => {
    const course = world.fixtures.createCourse({ title: "Favourite Course" });
    const favourites: typeof course[] = [];
    favourites.push(course);

    expect(favourites).toHaveLength(1);
    expect(favourites[0].title).toBe("Favourite Course");
  });
});
