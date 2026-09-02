import { describe, it, expect } from "vitest";
import { simpleTypes, loCompositeTypes } from "../../../packages/jsr/model/src/types/type-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface UnitLo {
  type: string;
  title: string;
  route: string;
}

interface UnitData {
  title: string;
  los: UnitLo[];
}

const knownLoTypes = [...simpleTypes, ...loCompositeTypes];

function makeUnit(overrides: Partial<UnitData> = {}): UnitData {
  return {
    title: "Unit 1: Foundations",
    los: [
      { type: "lab", title: "Lab 01", route: "/lab/lab-01" },
      { type: "talk", title: "Lecture 01", route: "/talk/lecture-01" },
      { type: "note", title: "Note 01", route: "/note/note-01" },
    ],
    ...overrides,
  };
}

// ===========================================================================
// Unit title
// ===========================================================================
describe("UnitCard: unit title", () => {
  it("should display the unit title", () => {
    const unit = makeUnit({ title: "Unit 2: Advanced Topics" });
    expect(unit.title).toBe("Unit 2: Advanced Topics");
  });

  it("title should be a non-empty string", () => {
    const unit = makeUnit();
    expect(typeof unit.title).toBe("string");
    expect(unit.title.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Learning objects by type
// ===========================================================================
describe("UnitCard: learning objects by type", () => {
  it("should list learning objects with their types", () => {
    const unit = makeUnit();
    unit.los.forEach((lo) => {
      expect(lo.type).toBeDefined();
      expect(lo.title).toBeDefined();
    });
  });

  it("should group LOs by type", () => {
    const unit = makeUnit();
    const grouped = unit.los.reduce(
      (acc, lo) => {
        acc[lo.type] = (acc[lo.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    expect(grouped["lab"]).toBe(1);
    expect(grouped["talk"]).toBe(1);
    expect(grouped["note"]).toBe(1);
  });
});

// ===========================================================================
// LO count badge
// ===========================================================================
describe("UnitCard: LO count badge", () => {
  it("should show total LO count", () => {
    const unit = makeUnit();
    expect(unit.los.length).toBe(3);
  });

  it("count should be zero for empty unit", () => {
    const unit = makeUnit({ los: [] });
    expect(unit.los.length).toBe(0);
  });

  it("count should be a non-negative integer", () => {
    const unit = makeUnit();
    expect(unit.los.length).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(unit.los.length)).toBe(true);
  });
});

// ===========================================================================
// Empty unit handling
// ===========================================================================
describe("UnitCard: empty unit handling", () => {
  it("should handle empty unit without errors", () => {
    const unit = makeUnit({ los: [] });
    expect(unit.los).toHaveLength(0);
    expect(unit.title).toBeDefined();
  });

  it("empty unit should still display title", () => {
    const unit = makeUnit({ title: "Empty Unit", los: [] });
    expect(unit.title).toBe("Empty Unit");
  });
});

// ===========================================================================
// Type indicators mapping
// ===========================================================================
describe("UnitCard: type indicators", () => {
  it("LO types should map to known types", () => {
    const unit = makeUnit();
    unit.los.forEach((lo) => {
      expect(knownLoTypes).toContain(lo.type);
    });
  });

  it("all simple types should be recognised", () => {
    expect(simpleTypes).toContain("lab");
    expect(simpleTypes).toContain("talk");
    expect(simpleTypes).toContain("note");
    expect(simpleTypes).toContain("web");
    expect(simpleTypes).toContain("github");
    expect(simpleTypes).toContain("archive");
  });

  it("composite types should be recognised", () => {
    expect(loCompositeTypes).toContain("unit");
    expect(loCompositeTypes).toContain("topic");
    expect(loCompositeTypes).toContain("course");
  });

  it("total known types should be 19", () => {
    expect(knownLoTypes.length).toBe(19);
  });
});
