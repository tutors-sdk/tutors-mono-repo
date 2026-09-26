import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCompanions,
  createToc,
  createWalls,
  initCalendar,
  loadPropertyFlags,
  pluraliseLoType,
} from "../../../packages/jsr/model/src/utils/course-utils";
import type { Course } from "../../../packages/jsr/model/src/types/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeLo(type: string, id: string, overrides: Record<string, unknown> = {}): any {
  return {
    type,
    id,
    title: `${type} ${id}`,
    summary: "",
    contentMd: "",
    route: `/${type}/${id}`,
    authLevel: 0,
    img: "",
    video: "",
    hide: false,
    ...overrides,
  };
}

function makeTopic(id: string, parts: Record<string, any[]> = {}): any {
  return makeLo("topic", id, {
    los: [],
    panels: {
      panelVideos: parts.panelVideos ?? [],
      panelTalks: parts.panelTalks ?? [],
      panelNotes: parts.panelNotes ?? [],
    },
    units: {
      units: parts.units ?? [],
      standardLos: parts.standardLos ?? [],
      sides: parts.sides ?? [],
    },
  });
}

function makeCourse(overrides: Record<string, unknown> = {}): Course {
  return { courseId: "c1", los: [], ...overrides } as unknown as Course;
}

// ===========================================================================
// createToc
// ===========================================================================
describe("createToc — mutation killing", () => {
  it("builds the toc in panel/unit order and links parents", () => {
    const video = makeLo("panelvideo", "v");
    const talk = makeLo("paneltalk", "t");
    const pnote = makeLo("panelnote", "pn");
    const unitChild = makeLo("lab", "ul");
    const unit = makeLo("unit", "u", { los: [unitChild] });
    const std = makeLo("note", "n");
    const sideChild = makeLo("talk", "sl");
    const side = makeLo("side", "s", { los: [sideChild] });
    const topic = makeTopic("top", {
      panelVideos: [video],
      panelTalks: [talk],
      panelNotes: [pnote],
      units: [unit],
      standardLos: [std],
      sides: [side],
    });
    const course = makeCourse({ los: [topic] });

    createToc(course);

    expect(topic.toc.map((l: any) => l.id)).toEqual(["v", "t", "pn", "u", "n", "s"]);
    for (const lo of topic.toc) {
      expect(lo.parentLo).toBe(course);
      expect(lo.parentTopic).toBe(topic);
    }
    expect(unitChild.parentTopic).toBe(topic);
    expect(sideChild.parentTopic).toBe(topic);
  });

  it("does not set parentTopic on children of non-unit/side los", () => {
    const child = makeLo("note", "child");
    const std = makeLo("lab", "l", { los: [child] });
    const topic = makeTopic("top", { standardLos: [std] });
    createToc(makeCourse({ los: [topic] }));
    expect(std.parentTopic).toBe(topic);
    expect(child.parentTopic).toBeUndefined();
  });

  it("replaces any previous toc rather than appending", () => {
    const std = makeLo("note", "n");
    const topic = makeTopic("top", { standardLos: [std] });
    topic.toc = [makeLo("note", "stale")];
    createToc(makeCourse({ los: [topic] }));
    expect(topic.toc).toEqual([std]);
  });

  it("ignores los that are not topics", () => {
    const note = makeLo("note", "n", { panels: { panelVideos: [], panelTalks: [], panelNotes: [] } });
    createToc(makeCourse({ los: [note] }));
    expect(note.toc).toBeUndefined();
  });
});

// ===========================================================================
// createCompanions
// ===========================================================================
describe("createCompanions — mutation killing", () => {
  it("hides the bar and does not throw when there are no properties", () => {
    const course = makeCourse();
    createCompanions(course);
    expect(course.companions).toEqual({ show: false, bar: [] });
  });

  it("hides the bar when properties hold no companion keys", () => {
    const course = makeCourse({ properties: { title: "x" } });
    createCompanions(course);
    expect(course.companions.show).toBe(false);
    expect(course.companions.bar).toEqual([]);
  });

  it("adds a link per known companion property, in list order", () => {
    const course = makeCourse({
      properties: {
        podcast: "https://pod",
        slack: "https://slack",
        zoom: "https://zoom",
        moodle: "https://moodle",
        youtube: "https://yt",
        teams: "https://teams",
      },
    });
    createCompanions(course);
    expect(course.companions.show).toBe(true);
    expect(course.companions.bar).toEqual([
      { link: "https://slack", type: "slack", target: "_blank", tip: "Go to module Slack channel" },
      { link: "https://zoom", type: "zoom", target: "_blank", tip: "Go to module Zoom meeting" },
      { link: "https://moodle", type: "moodle", target: "_blank", tip: "Go to module Moodle page" },
      { link: "https://yt", type: "youtube", target: "_blank", tip: "Go to module YouTube channel" },
      { link: "https://teams", type: "teams", target: "_blank", tip: "Go to module Teams meeting" },
      { link: "https://pod", type: "podcast", target: "_blank", tip: "Go to module Podcast" },
    ]);
  });

  it("skips a known companion whose value is empty", () => {
    const course = makeCourse({ properties: { slack: "", zoom: "https://zoom" } });
    createCompanions(course);
    expect(course.companions.bar.map((c) => c.type)).toEqual(["zoom"]);
  });

  it("adds custom companions after the known ones", () => {
    const course = makeCourse({
      properties: {
        slack: "https://slack",
        companions: {
          discord: { link: "https://discord", title: "Chat on Discord", icon: "x" },
        },
      },
    });
    createCompanions(course);
    expect(course.companions.show).toBe(true);
    expect(course.companions.bar[1]).toEqual({
      link: "https://discord",
      type: "discord",
      target: "_blank",
      tip: "Chat on Discord",
    });
    expect(course.companions.bar).toHaveLength(2);
  });

  it("shows the bar when only custom companions exist", () => {
    const course = makeCourse({
      properties: { companions: { gh: { link: "https://gh", title: "GH" } } },
    });
    createCompanions(course);
    expect(course.companions.show).toBe(true);
    expect(course.companions.bar).toHaveLength(1);
  });
});

// ===========================================================================
// createWalls / pluraliseLoType
// ===========================================================================
describe("createWalls — mutation killing", () => {
  it("shows the wall bar with one link per wall", () => {
    const course = makeCourse({ los: [makeLo("note", "n1"), makeLo("lab", "l1")] });
    createWalls(course);
    expect(course.wallBar.show).toBe(true);
    expect(course.wallBar.bar).toEqual([
      { link: "/wall/note/c1", type: "note", tip: "All notes in the course", target: "" },
      { link: "/wall/lab/c1", type: "lab", tip: "All labs in the course", target: "" },
    ]);
  });

  it("has an empty bar and map when there are no los", () => {
    const course = makeCourse();
    createWalls(course);
    expect(course.walls).toEqual([]);
    expect(course.wallBar).toEqual({ show: true, bar: [] });
    expect(course.wallMap.size).toBe(0);
  });
});

describe("pluraliseLoType — anchor on sibilant rule", () => {
  it("only applies 'es' when the sibilant is at the end", () => {
    expect(pluraliseLoType("sheet")).toBe("sheets");
    expect(pluraliseLoType("xylo")).toBe("xylos");
    expect(pluraliseLoType("chart")).toBe("charts");
  });
});

// ===========================================================================
// loadPropertyFlags
// ===========================================================================
describe("loadPropertyFlags — mutation killing", () => {
  it("applies defaults and does not throw when there are no properties", () => {
    const course = makeCourse();
    loadPropertyFlags(course);
    expect(course.isPortfolio).toBe(false);
    expect(course.isPrivate).toBe(false);
    expect(course.areVideosHidden).toBe(false);
    expect(course.areLabStepsAutoNumbered).toBe(false);
    expect(course.hasWhiteboard).toBe(false);
    expect(course.defaultPdfReader).toBe("adobe");
    expect(course.pdfOrientation).toBe("landscape");
    expect(course.hasEnrollment).toBeUndefined();
    expect(course.hasCalendar).toBeUndefined();
    expect(course.ignorePin).toBeUndefined();
    expect(course.icon).toBeUndefined();
    expect(course.llm).toBeUndefined();
    expect(course.footer).toBeUndefined();
    expect(course.authLevel).toBeUndefined();
  });

  it("applies defaults with an empty properties object", () => {
    const course = makeCourse({ properties: {} });
    loadPropertyFlags(course);
    expect(course.isPortfolio).toBe(false);
    expect(course.isPrivate).toBe(false);
    expect(course.areVideosHidden).toBe(false);
    expect(course.areLabStepsAutoNumbered).toBe(false);
    expect(course.hasWhiteboard).toBe(false);
    expect(course.defaultPdfReader).toBe("adobe");
    expect(course.pdfOrientation).toBe("landscape");
    expect(course.icon).toBeUndefined();
  });

  it("reads every flag when set", () => {
    const course = makeCourse({
      properties: {
        portfolio: true,
        llm: 3,
        private: 1,
        hideVideos: true,
        footer: "foot",
        labStepsAutoNumber: true,
        auth: 2,
        defaultPdfReader: "browser",
        pdfOrientation: "portrait",
        whiteboard: 1,
        ignorepin: 1234,
        icon: { type: "fa-book", color: "red" },
      },
      enrollment: ["a"],
      calendar: { weeks: [] },
    });
    loadPropertyFlags(course);
    expect(course.isPortfolio).toBe(true);
    expect(course.llm).toBe(3);
    expect(course.isPrivate).toBe(true);
    expect(course.areVideosHidden).toBe(true);
    expect(course.footer).toBe("foot");
    expect(course.areLabStepsAutoNumbered).toBe(true);
    expect(course.authLevel).toBe(2);
    expect(course.defaultPdfReader).toBe("browser");
    expect(course.pdfOrientation).toBe("portrait");
    expect(course.hasEnrollment).toBe(true);
    expect(course.hasCalendar).toBe(true);
    expect(course.hasWhiteboard).toBe(true);
    expect(course.ignorePin).toBe("1234");
    expect(course.icon).toEqual({ type: "fa-book", color: "red" });
  });

  it("uses strict equality for flags (truthy non-true values do not count)", () => {
    const course = makeCourse({
      properties: {
        portfolio: "true",
        private: true,
        hideVideos: 1,
        labStepsAutoNumber: "yes",
        whiteboard: "1",
      },
    });
    loadPropertyFlags(course);
    expect(course.isPortfolio).toBe(false);
    expect(course.isPrivate).toBe(false);
    expect(course.areVideosHidden).toBe(false);
    expect(course.areLabStepsAutoNumbered).toBe(false);
    expect(course.hasWhiteboard).toBe(false);
  });

  it("ignores an icon missing its colour or type, or null", () => {
    const typeOnly = makeCourse({ properties: { icon: { type: "fa-book" } } });
    loadPropertyFlags(typeOnly);
    expect(typeOnly.icon).toBeUndefined();

    const colorOnly = makeCourse({ properties: { icon: { color: "red" } } });
    loadPropertyFlags(colorOnly);
    expect(colorOnly.icon).toBeUndefined();

    const nullIcon = makeCourse({ properties: { icon: null } });
    expect(() => loadPropertyFlags(nullIcon)).not.toThrow();
    expect(nullIcon.icon).toBeUndefined();
  });

  it("does not overwrite an existing icon when the property is not an object", () => {
    const existing = { type: "keep", color: "blue" };
    const course = makeCourse({ properties: { icon: "fa-book" }, icon: existing });
    loadPropertyFlags(course);
    expect(course.icon).toBe(existing);
  });

  it("propagates hide to children of hidden composite los only", () => {
    const hiddenChild = makeLo("note", "hc");
    const hiddenUnit = makeLo("unit", "hu", { hide: true, los: [hiddenChild] });
    const visibleChild = makeLo("note", "vc");
    const visibleUnit = makeLo("unit", "vu", { hide: false, los: [visibleChild] });
    const course = makeCourse({ los: [hiddenUnit, visibleUnit] });
    loadPropertyFlags(course);
    expect(hiddenUnit.hide).toBe(true);
    expect(hiddenChild.hide).toBe(true);
    expect(visibleUnit.hide).toBe(false);
    expect(visibleChild.hide).toBe(false);
  });
});

// ===========================================================================
// initCalendar
// ===========================================================================
describe("initCalendar — mutation killing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing and logs nothing when there is no calendar", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const course = makeCourse();
    initCalendar(course, 0);
    expect(course.courseCalendar).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("produces an empty week list when weeks is not an array", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const course = makeCourse({ calendar: { title: "T", weeks: "nope" } });
    initCalendar(course, 0);
    expect(course.courseCalendar).toEqual({ title: "T", year: undefined, weeks: [], currentWeek: undefined });
    expect(spy).not.toHaveBeenCalled();
  });

  it("parses the new format including breaks, week numbers and assessments", () => {
    const course = makeCourse({
      calendar: {
        title: "Sem",
        year: "2026",
        weeks: [
          {
            date: "2026-09-07",
            week: 3,
            topic: "Intro",
            assessment: { name: "A1", due: "2026-09-10", percentage: 20, submission: "moodle", extra: "x" },
          },
          { date: "2026-09-14", week: null, topic: "Reading week", assessment: "not-an-object" },
          { date: "2026-09-21", topic: "Missing week" },
        ],
      },
    });
    initCalendar(course, 0);
    const cal = course.courseCalendar!;
    expect(cal.title).toBe("Sem");
    expect(cal.year).toBe(2026);
    expect(cal.weeks).toHaveLength(3);
    expect(cal.weeks[0]).toEqual({
      date: "2026-09-07",
      title: "Intro",
      type: "topic",
      dateObj: new Date("2026-09-07"),
      weekNumber: 3,
      assessment: { name: "A1", due: "2026-09-10", percentage: 20, submission: "moodle" },
    });
    expect(cal.weeks[1].type).toBe("break");
    expect(cal.weeks[1].weekNumber).toBeUndefined();
    expect(cal.weeks[1].assessment).toBeUndefined();
    expect(cal.weeks[2].type).toBe("break");
  });

  it("parses the old keyed format", () => {
    const course = makeCourse({
      calendar: {
        title: "Old",
        weeks: [{ "2026-09-07": { title: "Week A", type: "lecture" } }],
      },
    });
    initCalendar(course, 0);
    expect(course.courseCalendar!.weeks).toEqual([
      { date: "2026-09-07", title: "Week A", type: "lecture", dateObj: new Date("2026-09-07") },
    ]);
  });

  const weeks = [
    { date: "2026-09-07", week: 1, topic: "One" },
    { date: "2026-09-14", week: 2, topic: "Two" },
  ];

  it("does not treat the exact start instant of a week as inside it", () => {
    const course = makeCourse({ calendar: { weeks } });
    initCalendar(course, Date.parse("2026-09-07"));
    expect(course.courseCalendar!.currentWeek).toBeUndefined();
  });

  it("treats the exact start of the next week as still inside the previous one", () => {
    const course = makeCourse({ calendar: { weeks } });
    initCalendar(course, Date.parse("2026-09-14"));
    expect(course.courseCalendar!.currentWeek?.title).toBe("One");
  });

  it("still builds the calendar when today is after the last week", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const course = makeCourse({ calendar: { weeks } });
    initCalendar(course, Date.parse("2030-01-01"));
    expect(course.courseCalendar!.weeks).toHaveLength(2);
    expect(course.courseCalendar!.currentWeek).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports a malformed calendar on stderr instead of throwing", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const course = makeCourse({ calendar: { weeks: [{}] } });
    expect(() => initCalendar(course, 0)).not.toThrow();
    expect(course.courseCalendar).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toMatch(/^Error loading calendar: .+\n$/);
  });
});
