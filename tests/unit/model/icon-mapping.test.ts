import { describe, it, expect } from "vitest";
import { loadIcon } from "../../../packages/jsr/model/src/utils/lo-utils";

/**
 * Tests for the loadIcon function -- extracts icon type and color
 * from an Lo's frontMatter.icon property.
 */

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeLo(frontMatter: Record<string, unknown> = {}): any {
  return {
    type: "note",
    id: "lo-1",
    title: "Test",
    summary: "",
    contentMd: "",
    route: "/lo-1",
    authLevel: 0,
    img: "",
    video: "",
    hide: false,
    frontMatter,
  };
}

describe("loadIcon", () => {
  it("returns an IconType with type and color when icon is present", () => {
    const lo = makeLo({ icon: { type: "fas fa-book", color: "blue" } });
    const icon = loadIcon(lo);
    expect(icon).toBeDefined();
    expect(icon!.type).toBe("fas fa-book");
    expect(icon!.color).toBe("blue");
  });

  it("returns undefined when frontMatter has no icon property", () => {
    const lo = makeLo({});
    expect(loadIcon(lo)).toBeUndefined();
  });

  it("returns undefined when frontMatter is falsy", () => {
    const lo = makeLo();
    lo.frontMatter = undefined;
    expect(loadIcon(lo)).toBeUndefined();
  });

  it("handles icon with empty strings for type and color", () => {
    const lo = makeLo({ icon: { type: "", color: "" } });
    const icon = loadIcon(lo);
    expect(icon).toBeDefined();
    expect(icon!.type).toBe("");
    expect(icon!.color).toBe("");
  });

  it("extracts icon from a lab Lo", () => {
    const lo = makeLo({ icon: { type: "fas fa-flask", color: "green" } });
    lo.type = "lab";
    const icon = loadIcon(lo);
    expect(icon).toEqual({ type: "fas fa-flask", color: "green" });
  });

  it("extracts icon from a talk Lo", () => {
    const lo = makeLo({ icon: { type: "fas fa-comment", color: "#333" } });
    lo.type = "talk";
    const icon = loadIcon(lo);
    expect(icon).toEqual({ type: "fas fa-comment", color: "#333" });
  });

  it("ignores other frontMatter properties and only reads icon", () => {
    const lo = makeLo({
      order: 5,
      icon: { type: "fas fa-star", color: "gold" },
      tags: ["intro"],
    });
    const icon = loadIcon(lo);
    expect(icon).toEqual({ type: "fas fa-star", color: "gold" });
  });
});
