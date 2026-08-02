import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";
import { sortLos } from "../../../../packages/jsr/model/src/utils/lo-utils";

describe("Instructor: Course Authoring", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall display all topics in defined order", () => {
    const topics = [
      world.fixtures.createTopic({ title: "Networks" }),
      world.fixtures.createTopic({ title: "Databases" }),
      world.fixtures.createTopic({ title: "Security" }),
    ];
    const course = world.fixtures.createCourse({ topics });

    expect(course.topics).toHaveLength(3);
    expect(course.topics[0].title).toBe("Networks");
    expect(course.topics[2].title).toBe("Security");
  });

  it("shall display units within topics", () => {
    const unit1 = world.fixtures.createUnit({ title: "Unit A" });
    const unit2 = world.fixtures.createUnit({ title: "Unit B" });
    const topic = world.fixtures.createTopic({
      title: "Topic 1",
      units: [unit1, unit2],
    });

    expect(topic.units).toHaveLength(2);
    expect(topic.units[0].title).toBe("Unit A");
  });

  it("shall support all learning object types", () => {
    const types = ["lab", "talk", "note", "web", "github", "archive", "tutorial", "notebook"];
    const los = types.map((type) => world.fixtures.createLearningObject({ type }));

    expect(los).toHaveLength(8);
    const createdTypes = los.map((lo) => lo.type);
    types.forEach((type) => {
      expect(createdTypes).toContain(type);
    });
  });

  it("shall sort LOs by frontMatter.order when present", () => {
    const lo1 = { type: "lab", title: "Lab 3", route: "/lab-3", frontMatter: { order: 3 } } as any;
    const lo2 = { type: "lab", title: "Lab 1", route: "/lab-1", frontMatter: { order: 1 } } as any;
    const lo3 = { type: "lab", title: "Lab 2", route: "/lab-2" } as any;

    const sorted = sortLos([lo1, lo2, lo3]);
    expect(sorted[0].title).toBe("Lab 1");
    expect(sorted[1].title).toBe("Lab 3");
    expect(sorted[2].title).toBe("Lab 2");
  });

  it("shall apply course properties", () => {
    const course = world.fixtures.createCourse({
      properties: { isPortfolio: "true", authLevel: "1" },
    });

    expect(course.properties).toBeDefined();
    expect(course.properties?.isPortfolio).toBe("true");
  });
});
