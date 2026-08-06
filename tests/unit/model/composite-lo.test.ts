import { describe, it, expect } from "vitest";
import {
  setShowHide,
  crumbs,
  getUnits,
  getPanels,
} from "../../../packages/jsr/model/src/utils/lo-utils";

/**
 * Tests for composite Lo operations:
 * - setShowHide recursion
 * - crumbs breadcrumb building
 * - getUnits / getPanels extraction
 */

// ---------------------------------------------------------------------------
// Helpers
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
// setShowHide recursion
// ===========================================================================
describe("setShowHide recursion", () => {
  it("sets hide=true on a simple (non-composite) Lo", () => {
    const lo = makeLo({ hide: false });
    setShowHide(lo, true);
    expect(lo.hide).toBe(true);
  });

  it("recursively sets hide on deeply nested composite Los", () => {
    const leaf = makeLo({ id: "leaf", hide: false });
    const mid = makeCompositeLo("unit", [leaf], { id: "mid", hide: false });
    const root = makeCompositeLo("topic", [mid], { id: "root", hide: false });

    setShowHide(root, true);
    expect(root.hide).toBe(true);
    expect(mid.hide).toBe(true);
    expect(leaf.hide).toBe(true);
  });

  it("can toggle hide back to false", () => {
    const child = makeLo({ id: "c", hide: true });
    const parent = makeCompositeLo("topic", [child], { hide: true });

    setShowHide(parent, false);
    expect(parent.hide).toBe(false);
    expect(child.hide).toBe(false);
  });

  it("handles composite Lo with no children (empty los array)", () => {
    const empty = makeCompositeLo("unit", [], { hide: false });
    setShowHide(empty, true);
    expect(empty.hide).toBe(true);
  });

  it("sets hide on multiple siblings within a composite", () => {
    const c1 = makeLo({ id: "c1", hide: false });
    const c2 = makeLo({ id: "c2", hide: false });
    const c3 = makeLo({ id: "c3", hide: false });
    const parent = makeCompositeLo("topic", [c1, c2, c3], { hide: false });

    setShowHide(parent, true);
    expect(c1.hide).toBe(true);
    expect(c2.hide).toBe(true);
    expect(c3.hide).toBe(true);
  });
});

// ===========================================================================
// crumbs breadcrumb building
// ===========================================================================
describe("crumbs breadcrumb building", () => {
  it("builds ordered breadcrumbs from a parentLo chain", () => {
    const course = makeLo({ id: "course", title: "Course", route: "/course" });
    const topic = makeLo({ id: "topic", title: "Topic", route: "/course/topic", parentLo: course });
    const note = makeLo({ id: "note", title: "Note", route: "/course/topic/note", parentLo: topic });

    const trail: any[] = [];
    crumbs(note, trail);

    expect(trail.length).toBe(3);
    expect(trail[0].id).toBe("course");
    expect(trail[1].id).toBe("topic");
    expect(trail[2].id).toBe("note");
  });

  it("returns a single-element trail for a Lo with no parent", () => {
    const lo = makeLo({ id: "root", route: "/root" });
    const trail: any[] = [];
    crumbs(lo, trail);
    expect(trail.length).toBe(1);
    expect(trail[0].id).toBe("root");
  });

  it("strips trailing slash from each route in the trail", () => {
    const parent = makeLo({ id: "p", route: "/course/" });
    const child = makeLo({ id: "c", route: "/course/topic/", parentLo: parent });
    const trail: any[] = [];
    crumbs(child, trail);
    expect(trail[0].route).toBe("/course");
    expect(trail[1].route).toBe("/course/topic");
  });
});

// ===========================================================================
// getUnits extraction
// ===========================================================================
describe("getUnits extraction", () => {
  it("separates units from other Lo types", () => {
    const los = [
      makeLo({ type: "unit", id: "u1" }),
      makeLo({ type: "note", id: "n1" }),
      makeLo({ type: "lab", id: "l1" }),
    ];
    const result = getUnits(los);
    expect(result.units.length).toBe(1);
    expect(result.standardLos.length).toBe(2);
  });

  it("separates sides from units and standard Los", () => {
    const los = [
      makeLo({ type: "unit", id: "u1" }),
      makeLo({ type: "side", id: "s1" }),
      makeLo({ type: "talk", id: "t1" }),
    ];
    const result = getUnits(los);
    expect(result.units.length).toBe(1);
    expect(result.sides.length).toBe(1);
    expect(result.standardLos.length).toBe(1);
  });

  it("excludes panel types and podcasts from standardLos", () => {
    const los = [
      makeLo({ type: "panelvideo", id: "pv1" }),
      makeLo({ type: "paneltalk", id: "pt1" }),
      makeLo({ type: "panelnote", id: "pn1" }),
      makeLo({ type: "podcast", id: "pc1" }),
      makeLo({ type: "note", id: "n1" }),
    ];
    const result = getUnits(los);
    expect(result.standardLos.length).toBe(1);
    expect((result.standardLos[0] as any).id).toBe("n1");
  });

  it("returns empty arrays for empty input", () => {
    const result = getUnits([]);
    expect(result.units).toEqual([]);
    expect(result.sides).toEqual([]);
    expect(result.standardLos).toEqual([]);
  });
});

// ===========================================================================
// getPanels extraction
// ===========================================================================
describe("getPanels extraction", () => {
  it("groups panel Los by their sub-type", () => {
    const los = [
      makeLo({ type: "panelvideo", id: "pv1" }),
      makeLo({ type: "panelvideo", id: "pv2" }),
      makeLo({ type: "paneltalk", id: "pt1" }),
      makeLo({ type: "panelnote", id: "pn1" }),
      makeLo({ type: "podcast", id: "pc1" }),
    ];
    const panels = getPanels(los);
    expect(panels.panelVideos.length).toBe(2);
    expect(panels.panelTalks.length).toBe(1);
    expect(panels.panelNotes.length).toBe(1);
    expect(panels.panelPodcasts.length).toBe(1);
  });

  it("returns empty arrays when no panel Los exist", () => {
    const los = [makeLo({ type: "note" }), makeLo({ type: "lab" })];
    const panels = getPanels(los);
    expect(panels.panelVideos).toEqual([]);
    expect(panels.panelTalks).toEqual([]);
    expect(panels.panelNotes).toEqual([]);
    expect(panels.panelPodcasts).toEqual([]);
  });
});
