import { describe, it, expect } from "vitest";
import {
  simpleTypes,
  loCompositeTypes,
  loTypes,
  isCompositeLo,
  preOrder,
  Properties,
} from "../../../packages/jsr/model/src/types/type-utils";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeLo(type: string): any {
  return {
    type,
    id: `${type}-1`,
    title: `${type} title`,
    summary: "",
    contentMd: "",
    route: `/${type}`,
    authLevel: 0,
    img: "",
    video: "",
    hide: false,
  };
}

// ===========================================================================
// simpleTypes
// ===========================================================================
describe("simpleTypes", () => {
  it("contains the expected simple type entries", () => {
    const expected = [
      "note", "archive", "web", "github", "panelnote",
      "paneltalk", "panelvideo", "podcast", "talk",
      "book", "lab", "tutorial", "notebook", "whiteboard",
    ];
    expected.forEach((t) => {
      expect(simpleTypes).toContain(t);
    });
  });

  it("has exactly 14 entries", () => {
    expect(simpleTypes.length).toBe(14);
  });

  it("does not contain composite types", () => {
    expect(simpleTypes).not.toContain("course");
    expect(simpleTypes).not.toContain("topic");
    expect(simpleTypes).not.toContain("unit");
    expect(simpleTypes).not.toContain("side");
  });
});

// ===========================================================================
// loCompositeTypes
// ===========================================================================
describe("loCompositeTypes", () => {
  it("contains unit, side, topic, and course", () => {
    expect(loCompositeTypes).toContain("unit");
    expect(loCompositeTypes).toContain("side");
    expect(loCompositeTypes).toContain("topic");
    expect(loCompositeTypes).toContain("course");
  });

  it("has exactly 4 entries", () => {
    expect(loCompositeTypes.length).toBe(4);
  });
});

// ===========================================================================
// loTypes
// ===========================================================================
describe("loTypes", () => {
  it("is the concatenation of simpleTypes and loCompositeTypes", () => {
    expect(loTypes.length).toBe(simpleTypes.length + loCompositeTypes.length);
    simpleTypes.forEach((t) => expect(loTypes).toContain(t));
    loCompositeTypes.forEach((t) => expect(loTypes).toContain(t));
  });
});

// ===========================================================================
// isCompositeLo
// ===========================================================================
describe("isCompositeLo", () => {
  it("returns true for composite types", () => {
    expect(isCompositeLo(makeLo("course"))).toBe(true);
    expect(isCompositeLo(makeLo("topic"))).toBe(true);
    expect(isCompositeLo(makeLo("unit"))).toBe(true);
    expect(isCompositeLo(makeLo("side"))).toBe(true);
  });

  it("returns false for simple types", () => {
    expect(isCompositeLo(makeLo("note"))).toBe(false);
    expect(isCompositeLo(makeLo("lab"))).toBe(false);
    expect(isCompositeLo(makeLo("talk"))).toBe(false);
    expect(isCompositeLo(makeLo("tutorial"))).toBe(false);
  });

  it("returns false for an unknown type", () => {
    expect(isCompositeLo(makeLo("unknown"))).toBe(false);
  });
});

// ===========================================================================
// preOrder
// ===========================================================================
describe("preOrder", () => {
  it("has entries for all loTypes", () => {
    loTypes.forEach((t) => {
      expect(preOrder.has(t)).toBe(true);
    });
  });

  it("orders course before all others (value 0)", () => {
    expect(preOrder.get("course")).toBe(0);
  });

  it("assigns increasing values reflecting display order", () => {
    const courseOrder = preOrder.get("course")!;
    const topicOrder = preOrder.get("topic")!;
    const labOrder = preOrder.get("lab")!;
    expect(courseOrder).toBeLessThan(topicOrder);
    expect(topicOrder).toBeLessThan(labOrder);
  });
});

// ===========================================================================
// Properties
// ===========================================================================
describe("Properties", () => {
  it("supports dynamic string-key access", () => {
    const props = new Properties();
    props["title"] = "My Course";
    props["credits"] = "5";
    expect(props["title"]).toBe("My Course");
    expect(props["credits"]).toBe("5");
  });
});
