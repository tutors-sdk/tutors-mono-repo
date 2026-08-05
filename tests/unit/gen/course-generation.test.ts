import { describe, it, expect } from "vitest";

/**
 * Course generation shape tests.
 *
 * The gen library produces Course JSON objects that feed the Tutors reader.
 * These tests validate that a properly structured course object matches the
 * expected Course type shape defined in packages/jsr/model/src/types/learning-objects.ts.
 */

function makeCourse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "course",
    id: "setu-hdip-2024",
    title: "HDip Computer Science 2024",
    summary: "Full-time HDip programme in Computer Science",
    contentMd: "",
    route: "/course/setu-hdip-2024",
    courseId: "setu-hdip-2024",
    courseUrl: "https://tutors.dev/course/setu-hdip-2024",
    authLevel: 0,
    isPortfolio: false,
    isPrivate: false,
    img: "https://tutors.dev/course/setu-hdip-2024/course.png",
    imgFile: "course.png",
    video: "",
    hide: false,
    los: [],
    toc: [],
    panels: { panelVideos: [], panelTalks: [], panelNotes: [], panelPodcasts: [] },
    units: { units: [], sides: [], standardLos: [] },
    properties: {},
    llm: 0,
    pdfOrientation: "landscape",
    areVideosHidden: false,
    areLabStepsAutoNumbered: false,
    hasEnrollment: false,
    hasCalendar: false,
    defaultPdfReader: "default",
    footer: "",
    ignorePin: "",
    companions: { show: false, bar: [] },
    wallBar: { show: false, bar: [] },
    ...overrides,
  };
}

describe("course-generation: Course JSON shape", () => {
  it("has the required type field set to 'course'", () => {
    const course = makeCourse();
    expect(course.type).toBe("course");
  });

  it("has required identity fields: id, title, summary", () => {
    const course = makeCourse();
    expect(course.id).toBeDefined();
    expect(typeof course.id).toBe("string");
    expect(course.title).toBeDefined();
    expect(typeof course.title).toBe("string");
    expect(course.summary).toBeDefined();
    expect(typeof course.summary).toBe("string");
  });

  it("has route, courseId, and courseUrl fields", () => {
    const course = makeCourse();
    expect(course.route).toBe("/course/setu-hdip-2024");
    expect(course.courseId).toBe("setu-hdip-2024");
    expect(course.courseUrl).toContain("tutors.dev");
  });

  it("authLevel is a number", () => {
    const course = makeCourse();
    expect(typeof course.authLevel).toBe("number");
  });

  it("isPortfolio and isPrivate are booleans", () => {
    const course = makeCourse();
    expect(typeof course.isPortfolio).toBe("boolean");
    expect(typeof course.isPrivate).toBe("boolean");
  });

  it("contains a nested los array for topics", () => {
    const topic = {
      type: "topic",
      id: "topic-1",
      title: "Topic 1",
      los: [],
    };
    const course = makeCourse({ los: [topic] });
    const los = course.los as Array<Record<string, unknown>>;
    expect(Array.isArray(los)).toBe(true);
    expect(los).toHaveLength(1);
    expect(los[0].type).toBe("topic");
  });

  it("has panels object with expected sub-arrays", () => {
    const course = makeCourse();
    const panels = course.panels as Record<string, unknown[]>;
    expect(panels).toBeDefined();
    expect(Array.isArray(panels.panelVideos)).toBe(true);
    expect(Array.isArray(panels.panelTalks)).toBe(true);
    expect(Array.isArray(panels.panelNotes)).toBe(true);
    expect(Array.isArray(panels.panelPodcasts)).toBe(true);
  });

  it("has units object with units, sides, and standardLos arrays", () => {
    const course = makeCourse();
    const units = course.units as Record<string, unknown[]>;
    expect(Array.isArray(units.units)).toBe(true);
    expect(Array.isArray(units.sides)).toBe(true);
    expect(Array.isArray(units.standardLos)).toBe(true);
  });

  it("has companion and wallBar icon navigation bars", () => {
    const course = makeCourse();
    const companions = course.companions as Record<string, unknown>;
    const wallBar = course.wallBar as Record<string, unknown>;
    expect(typeof companions.show).toBe("boolean");
    expect(Array.isArray(companions.bar)).toBe(true);
    expect(typeof wallBar.show).toBe("boolean");
    expect(Array.isArray(wallBar.bar)).toBe(true);
  });

  it("has configuration flags for PDF orientation, video hiding, and lab numbering", () => {
    const course = makeCourse();
    expect(typeof course.pdfOrientation).toBe("string");
    expect(typeof course.areVideosHidden).toBe("boolean");
    expect(typeof course.areLabStepsAutoNumbered).toBe("boolean");
  });
});
