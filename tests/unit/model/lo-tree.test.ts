import { describe, expect, it } from "vitest";
import { decorateCourseTree, type Composite, type Course, type Lo } from "../../../packages/jsr/model/src/tutors.ts";

/**
 * decorateLoTree points a top-level unit or side at the course page. The generator
 * (buildUnit/buildSide in packages/jsr/gen) routes a unit to its parent's page, so a
 * unit directly under the course arrives as `/topic/{{COURSEURL}}/`.
 */
function lo(type: string, route: string, los: Lo[] = []): Lo {
  return { type, title: type, route, contentMd: `# ${type}`, summary: "", los } as unknown as Lo;
}

function decorate(courseId: string) {
  const unit = lo("unit", "/topic/{{COURSEURL}}/", [lo("note", "/note/{{COURSEURL}}/unit-1/note-1"), lo("note", "/note/{{COURSEURL}}/unit-1/note-2")]);
  const side = lo("side", "/topic/{{COURSEURL}}/", [lo("note", "/note/{{COURSEURL}}/side-1/note-1"), lo("note", "/note/{{COURSEURL}}/side-1/note-2")]);
  const nested = lo("unit", "/topic/{{COURSEURL}}/topic-01/", [lo("note", "/note/{{COURSEURL}}/topic-01/unit-1/note-1")]);
  const course = lo("course", "/", [unit, side, lo("topic", "/topic/{{COURSEURL}}/topic-01", [nested])]) as Course;
  course.properties = {};
  decorateCourseTree(course, courseId, `${courseId}.netlify.app`);
  return { unit: unit as Composite, side: side as Composite, nested: nested as Composite };
}

describe("decorateLoTree: top-level unit and side routes", () => {
  it.each(["cs101", "web-topics-2026", "topics-in-ai", "topic"])("routes a top-level unit and side to the course page for course id %s", (id) => {
    const { unit, side } = decorate(id);
    expect(unit.route).toBe(`/course/${id}`);
    expect(side.route).toBe(`/course/${id}`);
  });

  it("leaves a unit inside a topic on the topic page", () => {
    const { nested } = decorate("web-topics-2026");
    expect(nested.route).toBe("/topic/web-topics-2026/topic-01");
  });

  it("gives the descendants of a top-level unit a breadcrumb to the course page", () => {
    const { unit } = decorate("web-topics-2026");
    for (const child of unit.los) {
      expect(child.breadCrumbs?.[1].route).toBe("/course/web-topics-2026");
    }
  });
});
