import { describe, it, expect } from "vitest";
import {
  flattenLos,
  filterByType,
  removeLeadingHashes,
  fixRoutePaths,
  injectCourseUrl,
  removeUnknownLos,
  allVideoLos,
  sortLos,
  loadIcon,
  crumbs,
  setShowHide,
  getPanels,
  getUnits,
} from "../../../packages/jsr/model/src/utils/lo-utils";

// ---------------------------------------------------------------------------
// Helper: build a minimal Lo
// ---------------------------------------------------------------------------
function makeLo(overrides: Record<string, unknown> = {}): any {
  return {
    type: "note",
    id: "lo-1",
    title: "Test",
    summary: "",
    contentMd: "",
    route: "/course/topic/lo-1",
    authLevel: 0,
    img: "",
    video: "",
    hide: false,
    frontMatter: {},
    ...overrides,
  };
}

function makeCompositeLo(type: string, children: any[] = [], overrides: Record<string, unknown> = {}): any {
  return {
    ...makeLo({ type, ...overrides }),
    los: children,
    toc: [],
    panels: { panelVideos: [], panelTalks: [], panelNotes: [], panelPodcasts: [] },
    units: { units: [], sides: [], standardLos: [] },
  };
}

// ===========================================================================
// flattenLos
// ===========================================================================
describe("flattenLos", () => {
  it("returns a flat list from a single-level array", () => {
    const los = [makeLo({ id: "a" }), makeLo({ id: "b" })];
    const flat = flattenLos(los);
    expect(flat.length).toBe(2);
  });

  it("recursively flattens nested composite Los", () => {
    const child = makeLo({ id: "child" });
    const parent = makeCompositeLo("topic", [child], { id: "parent" });
    const flat = flattenLos([parent]);
    expect(flat.length).toBe(2);
    expect(flat.map((l: any) => l.id)).toContain("child");
  });

  it("returns empty array for empty input", () => {
    expect(flattenLos([])).toEqual([]);
  });
});

// ===========================================================================
// filterByType
// ===========================================================================
describe("filterByType", () => {
  it("returns only Los matching the specified type", () => {
    const los = [
      makeLo({ type: "note", id: "n1" }),
      makeLo({ type: "talk", id: "t1" }),
      makeLo({ type: "note", id: "n2" }),
    ];
    const notes = filterByType(los, "note");
    expect(notes.length).toBe(2);
    notes.forEach((lo: any) => expect(lo.type).toBe("note"));
  });

  it("returns empty array when no Los match", () => {
    const los = [makeLo({ type: "talk" })];
    expect(filterByType(los, "lab").length).toBe(0);
  });
});

// ===========================================================================
// removeLeadingHashes
// ===========================================================================
describe("removeLeadingHashes", () => {
  it("removes everything up to and including the last #", () => {
    expect(removeLeadingHashes("## Title")).toBe(" Title");
    expect(removeLeadingHashes("### Sub")).toBe(" Sub");
  });

  it("returns the original string when no # is present", () => {
    expect(removeLeadingHashes("no-hash")).toBe("no-hash");
  });

  it("handles a single leading #", () => {
    expect(removeLeadingHashes("#single")).toBe("single");
  });
});

// ===========================================================================
// fixRoutePaths
// ===========================================================================
describe("fixRoutePaths", () => {
  it("replaces leading # with / in route", () => {
    const lo = makeLo({ route: "#course/topic" });
    fixRoutePaths(lo);
    expect(lo.route).toBe("/course/topic");
  });

  it("replaces leading # with / in video", () => {
    const lo = makeLo({ route: "/ok", video: "#video/path" });
    fixRoutePaths(lo);
    expect(lo.video).toBe("/video/path");
  });

  it("redirects route to video when route ends with md and video exists", () => {
    const lo = makeLo({ route: "/some/path.md", video: "/video/url" });
    fixRoutePaths(lo);
    expect(lo.route).toBe("/video/url");
  });
});

// ===========================================================================
// injectCourseUrl
// ===========================================================================
describe("injectCourseUrl", () => {
  it("replaces {{COURSEURL}} placeholders in route and img", () => {
    const lo = makeLo({
      route: "{{COURSEURL}}/topic",
      img: "{{COURSEURL}}/img.png",
      video: "{{COURSEURL}}/vid",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    expect(lo.route).toContain("course-id");
    expect(lo.img).toContain("https://example.com");
  });
});

// ===========================================================================
// removeUnknownLos
// ===========================================================================
describe("removeUnknownLos", () => {
  it("removes Los with type unknown", () => {
    const los = [makeLo({ type: "note" }), makeLo({ type: "unknown" }), makeLo({ type: "talk" })];
    removeUnknownLos(los);
    expect(los.every((lo: any) => lo.type !== "unknown")).toBe(true);
  });

  it("leaves array unchanged when no unknowns present", () => {
    const los = [makeLo({ type: "note" })];
    removeUnknownLos(los);
    expect(los.length).toBe(1);
  });
});

// ===========================================================================
// allVideoLos
// ===========================================================================
describe("allVideoLos", () => {
  it("returns only Los with a video property", () => {
    const los = [
      makeLo({ id: "v1", video: "https://youtube.com/1" }),
      makeLo({ id: "n1", video: "" }),
    ];
    const result = allVideoLos(los);
    expect(result.length).toBe(1);
    expect((result[0] as any).id).toBe("v1");
  });
});

// ===========================================================================
// sortLos
// ===========================================================================
describe("sortLos", () => {
  it("places ordered Los before unordered Los", () => {
    const los = [
      makeLo({ id: "u1", frontMatter: {} }),
      makeLo({ id: "o2", frontMatter: { order: 2 } }),
      makeLo({ id: "o1", frontMatter: { order: 1 } }),
    ];
    const sorted = sortLos(los);
    expect((sorted[0] as any).id).toBe("o1");
    expect((sorted[1] as any).id).toBe("o2");
    expect((sorted[2] as any).id).toBe("u1");
  });
});

// ===========================================================================
// loadIcon
// ===========================================================================
describe("loadIcon", () => {
  it("extracts icon type and color from frontMatter", () => {
    const lo = makeLo({
      frontMatter: { icon: { type: "fas fa-code", color: "red" } },
    });
    const icon = loadIcon(lo);
    expect(icon).toEqual({ type: "fas fa-code", color: "red" });
  });

  it("returns undefined when no icon in frontMatter", () => {
    const lo = makeLo({ frontMatter: {} });
    expect(loadIcon(lo)).toBeUndefined();
  });
});

// ===========================================================================
// crumbs
// ===========================================================================
describe("crumbs", () => {
  it("builds a breadcrumb trail from nested parentLo chain", () => {
    const grandparent = makeLo({ id: "gp", title: "Course", route: "/course/" });
    const parent = makeLo({ id: "p", title: "Topic", route: "/course/topic/", parentLo: grandparent });
    const child = makeLo({ id: "c", title: "Note", route: "/course/topic/note/", parentLo: parent });
    const trail: any[] = [];
    crumbs(child, trail);
    expect(trail.length).toBe(3);
    expect(trail[0].id).toBe("gp");
    expect(trail[2].id).toBe("c");
  });

  it("strips trailing slash from route", () => {
    const lo = makeLo({ route: "/course/topic/" });
    const trail: any[] = [];
    crumbs(lo, trail);
    expect(trail[0].route).toBe("/course/topic");
  });

  it("handles undefined lo gracefully", () => {
    const trail: any[] = [];
    crumbs(undefined, trail);
    expect(trail.length).toBe(0);
  });
});

// ===========================================================================
// setShowHide
// ===========================================================================
describe("setShowHide", () => {
  it("recursively sets hide on composite Los", () => {
    const child1 = makeLo({ id: "c1", hide: false });
    const child2 = makeLo({ id: "c2", hide: false });
    const parent = makeCompositeLo("topic", [child1, child2], { hide: false });
    setShowHide(parent, true);
    expect(parent.hide).toBe(true);
    expect(child1.hide).toBe(true);
    expect(child2.hide).toBe(true);
  });
});

// ===========================================================================
// getPanels
// ===========================================================================
describe("getPanels", () => {
  it("extracts panel-type Los into categorized arrays", () => {
    const los = [
      makeLo({ type: "panelvideo", id: "pv1" }),
      makeLo({ type: "paneltalk", id: "pt1" }),
      makeLo({ type: "panelnote", id: "pn1" }),
      makeLo({ type: "podcast", id: "pc1" }),
      makeLo({ type: "note", id: "n1" }),
    ];
    const panels = getPanels(los);
    expect(panels.panelVideos.length).toBe(1);
    expect(panels.panelTalks.length).toBe(1);
    expect(panels.panelNotes.length).toBe(1);
    expect(panels.panelPodcasts.length).toBe(1);
  });
});

// ===========================================================================
// getUnits
// ===========================================================================
describe("getUnits", () => {
  it("separates units, sides, and standard Los", () => {
    const los = [
      makeLo({ type: "unit", id: "u1" }),
      makeLo({ type: "side", id: "s1" }),
      makeLo({ type: "note", id: "n1" }),
      makeLo({ type: "talk", id: "t1" }),
    ];
    const units = getUnits(los);
    expect(units.units.length).toBe(1);
    expect(units.sides.length).toBe(1);
    expect(units.standardLos.length).toBe(2);
  });

  it("excludes panel types from standardLos", () => {
    const los = [
      makeLo({ type: "panelvideo", id: "pv1" }),
      makeLo({ type: "note", id: "n1" }),
    ];
    const units = getUnits(los);
    expect(units.standardLos.length).toBe(1);
  });
});
