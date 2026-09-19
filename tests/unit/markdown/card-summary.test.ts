import { describe, it, expect, vi } from "vitest";
import type { Composite, Course, Lo } from "@tutors/tutors-model-lib";

// decorateCourseTree reaches themeService, which builds its runes at import time.
// Substituting a plain rune keeps the tree walk testable outside a Svelte compile.
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(initial: T) => ({ value: initial });
  return {
    rune,
    contentLocks: rune(new Map<string, boolean>()),
    isEducator: rune(false),
    locksLoaded: rune(false),
    tutorsId: rune(null),
    currentCourse: rune(null),
    courseProtocol: rune("https://")
  };
});

import { decorateCourseTree } from "../../../packages/svelte/course/src/course/services/lo-tree.ts";

const SUMMARY_MD = "**bold** intro";

function loOfType(type: string): Lo {
  return {
    type,
    id: `${type}-01`,
    title: `${type} 01`,
    summary: SUMMARY_MD,
    contentMd: `# ${type} 01\n\n${SUMMARY_MD}`,
    route: `/${type}/{{COURSEURL}}/week-01/${type}-01`,
    los: []
  } as unknown as Lo;
}

function buildCourse(): Course {
  return {
    title: "Test Course",
    type: "course",
    summary: SUMMARY_MD,
    contentMd: "# Test Course",
    los: [
      {
        type: "topic",
        id: "week-01",
        title: "Week 01",
        summary: SUMMARY_MD,
        contentMd: "# Week 01",
        route: "/topic/{{COURSEURL}}/week-01",
        los: ["lab", "note", "notebook", "quiz", "talk", "video"].map(loOfType)
      } as unknown as Lo
    ]
  } as unknown as Course;
}

function summaryOf(course: Course, type: string): string {
  const topic = course.los[0] as Composite;
  return (topic.los.find((lo) => lo.type === type) as Lo).summary;
}

describe("GIVEN a course tree decorated for the reader", () => {
  // Cards render lo.summary through {@html} as soon as the tree is built, so a summary
  // left as markdown shows its own source - "**bold**" and all - on the card.
  describe("WHEN an Lo type has its body converted on demand", () => {
    it.each(["lab", "note", "notebook", "quiz"])("shall still convert the %s summary to html", (type) => {
      const course = buildCourse();
      decorateCourseTree(course, "test", "test.netlify.app");
      expect(summaryOf(course, type)).toContain("<strong>bold</strong>");
    });

    it("shall leave the body of those types for on demand conversion", () => {
      const course = buildCourse();
      decorateCourseTree(course, "test", "test.netlify.app");
      const lab = (course.los[0] as Composite).los.find((lo) => lo.type === "lab") as Lo;
      expect(lab.contentHtml).toBeUndefined();
    });
  });

  describe("WHEN an Lo type is converted up front", () => {
    it.each(["talk", "video"])("shall convert the %s summary to html exactly once", (type) => {
      const course = buildCourse();
      decorateCourseTree(course, "test", "test.netlify.app");
      const summary = summaryOf(course, type);
      expect(summary).toContain("<strong>bold</strong>");
      expect(summary).not.toContain("&lt;");
    });

    it("shall convert the topic summary to html", () => {
      const course = buildCourse();
      decorateCourseTree(course, "test", "test.netlify.app");
      expect((course.los[0] as Lo).summary).toContain("<strong>bold</strong>");
    });
  });
});
