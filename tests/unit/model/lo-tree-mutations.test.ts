import { describe, it, expect } from "vitest";
import { decorateCourseTree, decorateLoTree } from "../../../packages/jsr/model/src/services/lo-tree";

// ---------------------------------------------------------------------------
// Helper: build a minimal Lo-compatible object. Leaves have no `los` array.
// ---------------------------------------------------------------------------
function makeLo(type: string, route: string, overrides: Record<string, unknown> = {}): any {
  return {
    type,
    id: `${type}-id`,
    title: type,
    summary: "",
    contentMd: "",
    route,
    img: "",
    video: "",
    hide: false,
    frontMatter: {},
    ...overrides,
  };
}

function makeCourse(los: any[], properties: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): any {
  return makeLo("course", "/", { los, properties, img: "https://{{COURSEURL}}/course.png", ...extra });
}

// ===========================================================================
// 1. decorateCourseTree — course-level wiring
// ===========================================================================
describe("decorateCourseTree — course wiring", () => {
  function build() {
    const talk = makeLo("talk", "/talk/{{COURSEURL}}/topic-01/talk-1", {
      video: "/video/{{COURSEURL}}/topic-01/talk-1",
      pdf: "https://{{COURSEURL}}/t.pdf",
      contentMd: "# Hello",
    });
    const note = makeLo("note", "/note/{{COURSEURL}}/topic-01/note-1");
    const topic = makeLo("topic", "/topic/{{COURSEURL}}/topic-01", { los: [talk, note] });
    const unknown = makeLo("unknown", "/unknown/{{COURSEURL}}/x");
    const course = makeCourse([topic, unknown], { slack: "https://slack.example/room", portfolio: true }, {
      calendar: { title: "Cal", year: "2026", weeks: [{ date: "2026-09-07", week: 1, topic: "Intro" }] },
    });
    decorateCourseTree(course, "cid", "cid.netlify.app");
    return { course, topic, talk, note };
  }

  it("sets course id, url and route", () => {
    const { course } = build();
    expect(course.courseId).toBe("cid");
    expect(course.courseUrl).toBe("cid.netlify.app");
    expect(course.route).toBe("/course/cid");
  });

  it("injects the course url into the course itself", () => {
    const { course } = build();
    expect(course.img).toBe("https://cid.netlify.app/course.png");
  });

  it("injects the course id into descendant routes, videos and pdfs", () => {
    const { topic, talk } = build();
    expect(topic.route).toBe("/topic/cid/topic-01");
    expect(talk.route).toBe("/talk/cid/topic-01/talk-1");
    expect(talk.video).toBe("/video/cid/topic-01/talk-1");
    expect(talk.pdf).toBe("https://cid.netlify.app/t.pdf");
  });

  it("removes unknown los from the course", () => {
    const { course } = build();
    expect(course.los.map((l: any) => l.type)).toEqual(["topic"]);
  });

  it("indexes every lo by route, including the course", () => {
    const { course, topic, talk, note } = build();
    expect(course.loIndex.get("/course/cid")).toBe(course);
    expect(course.loIndex.get("/topic/cid/topic-01")).toBe(topic);
    expect(course.loIndex.get("/talk/cid/topic-01/talk-1")).toBe(talk);
    expect(course.loIndex.get("/note/cid/topic-01/note-1")).toBe(note);
  });

  it("indexes video los by their video route", () => {
    const { course, talk } = build();
    expect(course.loIndex.get("/video/cid/topic-01/talk-1")).toBe(talk);
  });

  it("indexes topics in the topic index", () => {
    const { course, topic } = build();
    expect([...course.topicIndex.keys()]).toEqual(["/topic/cid/topic-01"]);
    expect(course.topicIndex.get("/topic/cid/topic-01")).toBe(topic);
  });

  it("loads property flags", () => {
    const { course } = build();
    expect(course.isPortfolio).toBe(true);
    expect(course.defaultPdfReader).toBe("adobe");
    expect(course.hasCalendar).toBe(true);
  });

  it("creates companions from course properties", () => {
    const { course } = build();
    expect(course.companions.show).toBe(true);
    expect(course.companions.bar.map((c: any) => c.link)).toEqual(["https://slack.example/room"]);
  });

  it("creates walls for the los in the course", () => {
    const { course, talk, note } = build();
    expect(course.wallMap.get("talk")).toEqual([talk]);
    expect(course.wallMap.get("note")).toEqual([note]);
    expect(course.wallBar.bar.map((b: any) => b.link)).toEqual(["/wall/talk/cid", "/wall/note/cid"]);
  });

  it("initialises the calendar", () => {
    const { course } = build();
    expect(course.courseCalendar.title).toBe("Cal");
    expect(course.courseCalendar.year).toBe(2026);
    expect(course.courseCalendar.weeks.map((w: any) => w.title)).toEqual(["Intro"]);
  });

  it("converts lo content markdown to html", () => {
    const { talk } = build();
    expect(talk.contentHtml).toContain("<h1");
    expect(talk.contentHtml).toContain("Hello");
  });

  it("does not give leaf los panels, units or a toc", () => {
    const { note, talk } = build();
    expect(note.panels).toBeUndefined();
    expect(note.toc).toBeUndefined();
    expect(talk.units).toBeUndefined();
  });

  it("sets parentCourse and parentLo on descendants", () => {
    const { course, topic, talk } = build();
    expect(talk.parentCourse).toBe(course);
    expect(talk.parentLo).toBe(topic);
    expect(topic.parentLo).toBe(course);
  });
});

// ===========================================================================
// 2. decorateLoTree — breadcrumbs and toc
// ===========================================================================
describe("decorateLoTree — breadcrumb rewriting", () => {
  it("does not rewrite the route of a top-level unit with no children", () => {
    const unit = makeLo("unit", "/topic/cid", { los: [] });
    const course = makeCourse([unit]);
    unit.parentLo = course;
    decorateLoTree(course, course);
    expect(unit.route).toBe("/topic/cid");
    expect(unit.breadCrumbs.map((c: any) => c.route)).toEqual(["", "/topic/cid"]);
  });

  it("does not rewrite a topic route when decorating its descendants", () => {
    const note = makeLo("note", "/note/cid/topic-01/n1");
    const topic = makeLo("topic", "/topic/cid/topic-01", { los: [note] });
    const course = makeCourse([topic]);
    topic.parentLo = course;
    decorateLoTree(course, course);
    expect(topic.route).toBe("/topic/cid/topic-01");
    expect(note.breadCrumbs.map((c: any) => c.route)).toEqual(["", "/topic/cid/topic-01", "/note/cid/topic-01/n1"]);
  });

  it("rewrites a bare /topic route of a top-level unit to /course", () => {
    const note = makeLo("note", "/note/n1");
    const unit = makeLo("unit", "/topic", { los: [note] });
    const course = makeCourse([unit]);
    decorateLoTree(course, course);
    expect(unit.route).toBe("/course");
  });

  it("builds the toc from panels then units, standard los and sides", () => {
    const pv = makeLo("panelvideo", "/pv");
    const pt = makeLo("paneltalk", "/pt");
    const pn = makeLo("panelnote", "/pn");
    const note = makeLo("note", "/n");
    const side = makeLo("side", "/s", { los: [] });
    const unit = makeLo("unit", "/u", { los: [] });
    const topic = makeLo("topic", "/topic/cid/t", { los: [side, note, unit, pn, pt, pv] });
    const course = makeCourse([topic]);
    decorateLoTree(course, course);
    expect(topic.toc).toEqual([pv, pt, pn, unit, note, side]);
    expect(course.toc).toEqual([topic]);
  });
});
