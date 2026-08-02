import { describe, it, expect } from "vitest";

/**
 * Course builder tests -- validates that the Course type hierarchy can be
 * constructed correctly and traversed (course -> topics -> units -> los).
 * We build mock objects that conform to the type shapes defined in
 * packages/jsr/model/src/types/learning-objects.ts.
 */

// ---------------------------------------------------------------------------
// Helpers: construct objects matching the type shapes
// ---------------------------------------------------------------------------
function makeLo(overrides: Record<string, unknown> = {}): any {
  return {
    type: "note",
    id: "lo-1",
    title: "A Note",
    summary: "summary",
    contentMd: "# Hello",
    route: "/course/topic/lo-1",
    authLevel: 0,
    img: "img.png",
    imgFile: "img.png",
    video: "",
    videoids: { videoid: "", videoIds: [] },
    hide: false,
    frontMatter: {},
    ...overrides,
  };
}

function makePanels(): any {
  return {
    panelVideos: [],
    panelTalks: [],
    panelNotes: [],
    panelPodcasts: [],
  };
}

function makeUnitsObj(): any {
  return { units: [], sides: [], standardLos: [] };
}

function makeTopic(id: string, los: any[] = []): any {
  return {
    ...makeLo({ type: "topic", id, title: `Topic ${id}`, route: `/course/${id}` }),
    los,
    toc: [],
    panels: makePanels(),
    units: makeUnitsObj(),
  };
}

function makeUnit(id: string, los: any[] = []): any {
  return {
    ...makeLo({ type: "unit", id, title: `Unit ${id}`, route: `/course/topic/${id}` }),
    los,
    toc: [],
    panels: makePanels(),
    units: makeUnitsObj(),
  };
}

function makeCourse(topics: any[]): any {
  return {
    ...makeLo({ type: "course", id: "course-1", title: "Test Course", route: "/course-1" }),
    courseId: "course-1",
    courseUrl: "https://example.com/course-1",
    los: topics,
    toc: topics,
    panels: makePanels(),
    units: makeUnitsObj(),
    topicIndex: new Map(),
    loIndex: new Map(),
    properties: {},
    authLevel: 0,
    isPortfolio: false,
    isPrivate: false,
    llm: 0,
    pdfOrientation: "landscape",
    areVideosHidden: false,
    areLabStepsAutoNumbered: true,
    hasEnrollment: false,
    hasCalendar: false,
    defaultPdfReader: "default",
    footer: "",
    ignorePin: "",
    companions: { show: false, bar: [] },
    wallBar: { show: false, bar: [] },
  };
}

// ===========================================================================
// Course structure
// ===========================================================================
describe("Course structure", () => {
  it("constructs a valid Course object with required properties", () => {
    const course = makeCourse([]);
    expect(course.type).toBe("course");
    expect(course.courseId).toBe("course-1");
    expect(course.courseUrl).toBe("https://example.com/course-1");
  });

  it("contains topics as direct children", () => {
    const t1 = makeTopic("t1");
    const t2 = makeTopic("t2");
    const course = makeCourse([t1, t2]);
    expect(course.los.length).toBe(2);
    expect(course.los[0].type).toBe("topic");
  });

  it("supports topics containing units", () => {
    const note = makeLo({ id: "n1" });
    const unit = makeUnit("u1", [note]);
    const topic = makeTopic("t1", [unit]);
    const course = makeCourse([topic]);

    const topicLo = course.los[0];
    expect(topicLo.los.length).toBe(1);
    expect(topicLo.los[0].type).toBe("unit");
    expect(topicLo.los[0].los[0].id).toBe("n1");
  });

  it("course hierarchy is traversable: course -> topic -> unit -> lo", () => {
    const lab = makeLo({ type: "lab", id: "lab-1" });
    const unit = makeUnit("u1", [lab]);
    const topic = makeTopic("t1", [unit]);
    const course = makeCourse([topic]);

    const traversed = course.los[0].los[0].los[0];
    expect(traversed.type).toBe("lab");
    expect(traversed.id).toBe("lab-1");
  });

  it("topicIndex and loIndex are initially empty maps", () => {
    const course = makeCourse([]);
    expect(course.topicIndex).toBeInstanceOf(Map);
    expect(course.loIndex).toBeInstanceOf(Map);
    expect(course.topicIndex.size).toBe(0);
  });

  it("panels structure is correctly initialized", () => {
    const course = makeCourse([]);
    expect(course.panels.panelVideos).toEqual([]);
    expect(course.panels.panelTalks).toEqual([]);
    expect(course.panels.panelNotes).toEqual([]);
    expect(course.panels.panelPodcasts).toEqual([]);
  });

  it("units structure is correctly initialized", () => {
    const course = makeCourse([]);
    expect(course.units.units).toEqual([]);
    expect(course.units.sides).toEqual([]);
    expect(course.units.standardLos).toEqual([]);
  });
});
