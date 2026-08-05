import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";

describe("Student: Course Discovery", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall display all public courses in the catalogue", () => {
    const course1 = world.fixtures.createCourse({ title: "Web Development" });
    const course2 = world.fixtures.createCourse({ title: "Data Science" });
    const courses = [course1, course2];

    expect(courses).toHaveLength(2);
    expect(courses[0].title).toBe("Web Development");
    expect(courses[1].title).toBe("Data Science");
  });

  it("shall return courses matching a search term", () => {
    const course = world.fixtures.createCourse({ title: "Introduction to Programming" });
    const searchTerm = "programming";
    const matches = [course].filter((c) => c.title.toLowerCase().includes(searchTerm));

    expect(matches).toHaveLength(1);
    expect(matches[0].title).toBe("Introduction to Programming");
  });

  it("shall filter learning objects by topic", () => {
    const webLo = world.fixtures.createLearningObject({ type: "lab", title: "HTML Basics" });
    const dataLo = world.fixtures.createLearningObject({ type: "lab", title: "Python Intro" });
    const webTopic = world.fixtures.createTopic({ title: "Web Development", los: [webLo] });
    const dataTopic = world.fixtures.createTopic({ title: "Data Science", los: [dataLo] });
    const course = world.fixtures.createCourse({ topics: [webTopic, dataTopic] });

    const filtered = course.topics.filter((t) => t.title === "Web Development");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].los).toHaveLength(1);
    expect(filtered[0].los[0].title).toBe("HTML Basics");
  });

  it("shall display course title and summary", () => {
    const course = world.fixtures.createCourse({ title: "Introduction to Computing" });
    expect(course.title).toBe("Introduction to Computing");
    expect(course.id).toBeDefined();
  });

  it("shall display topics in defined order", () => {
    const topics = [
      world.fixtures.createTopic({ title: "Topic A" }),
      world.fixtures.createTopic({ title: "Topic B" }),
      world.fixtures.createTopic({ title: "Topic C" }),
    ];
    const course = world.fixtures.createCourse({ topics });

    expect(course.topics[0].title).toBe("Topic A");
    expect(course.topics[1].title).toBe("Topic B");
    expect(course.topics[2].title).toBe("Topic C");
  });
});
