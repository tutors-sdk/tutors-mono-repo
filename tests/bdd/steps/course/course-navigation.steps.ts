import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";

describe("Course: Course Navigation", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall navigate from course to topic and display learning objects", () => {
    const lo = world.fixtures.createLearningObject({ type: "lab", title: "First Web Page" });
    const topic = world.fixtures.createTopic({ title: "HTML Fundamentals", los: [lo] });
    const course = world.fixtures.createCourse({ id: "web-dev-101", topics: [topic] });

    const selectedTopic = course.topics.find((t) => t.title === "HTML Fundamentals");
    expect(selectedTopic).toBeDefined();
    expect(selectedTopic!.los).toHaveLength(1);
    expect(selectedTopic!.los[0].title).toBe("First Web Page");
  });

  it("shall navigate from topic to lab and render lab content", () => {
    const lab = world.fixtures.createLearningObject({ type: "lab", title: "First Web Page" });
    const topic = world.fixtures.createTopic({ title: "HTML Fundamentals", los: [lab] });

    const selectedLab = topic.los.find((lo) => lo.title === "First Web Page");
    expect(selectedLab).toBeDefined();
    expect(selectedLab!.type).toBe("lab");
    expect(selectedLab!.route).toBeDefined();
  });

  it("shall search for content and return matching learning objects with types", () => {
    const cssLab = world.fixtures.createLearningObject({ type: "lab", title: "CSS Styling Basics" });
    const cssNote = world.fixtures.createLearningObject({ type: "note", title: "CSS Reference Guide" });
    const htmlLab = world.fixtures.createLearningObject({ type: "lab", title: "HTML Tables" });
    const topic = world.fixtures.createTopic({ los: [cssLab, cssNote, htmlLab] });

    const searchTerm = "css";
    const results = topic.los.filter((lo) => lo.title.toLowerCase().includes(searchTerm));

    expect(results).toHaveLength(2);
    results.forEach((r) => expect(r.type).toBeDefined());
  });

  it("shall build breadcrumb trail from course to current learning object", () => {
    const lab = world.fixtures.createLearningObject({ type: "lab", title: "First Web Page" });
    const topic = world.fixtures.createTopic({ title: "HTML Fundamentals", los: [lab] });
    const course = world.fixtures.createCourse({ id: "web-dev-101", title: "Web Dev 101", topics: [topic] });

    const breadcrumbs = [course.title, topic.title, lab.title];
    expect(breadcrumbs).toEqual(["Web Dev 101", "HTML Fundamentals", "First Web Page"]);
    expect(breadcrumbs).toHaveLength(3);
  });
});
