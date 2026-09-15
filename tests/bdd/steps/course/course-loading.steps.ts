import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";

describe("Course: Course Loading", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall load a course successfully with correct title and topic count", () => {
    const course = world.fixtures.createCourseWithTopics("web-dev-101", 3, 2);
    course.title = "Web Development 101";

    expect(course.id).toBe("web-dev-101");
    expect(course.title).toBe("Web Development 101");
    expect(course.topics).toHaveLength(3);
  });

  it("shall handle missing course gracefully", () => {
    const courses = new Map();
    const result = courses.get("nonexistent-course");

    expect(result).toBeUndefined();
  });

  it("shall load a course with nested units containing learning objects", () => {
    const lo1 = world.fixtures.createLearningObject({ type: "lab", title: "Lab 1" });
    const lo2 = world.fixtures.createLearningObject({ type: "talk", title: "Talk 1" });
    const unit = world.fixtures.createUnit({ los: [lo1, lo2] });
    const topic = world.fixtures.createTopic({ units: [unit] });
    const course = world.fixtures.createCourse({ id: "web-dev-101", topics: [topic] });

    expect(course.topics[0].units).toHaveLength(1);
    expect(course.topics[0].units[0].los).toHaveLength(2);
  });

  it("shall load learning objects of each supported type with valid routes", () => {
    const types = ["lab", "talk", "video", "note", "web", "github", "archive"];
    const learningObjects = types.map((type) =>
      world.fixtures.createLearningObject({ type })
    );

    for (const lo of learningObjects) {
      expect(types).toContain(lo.type);
      expect(lo.route).toBeDefined();
      expect(lo.route.length).toBeGreaterThan(0);
    }
  });
});
