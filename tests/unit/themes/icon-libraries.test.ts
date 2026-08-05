import { describe, it, expect } from "vitest";
import { loadIcon } from "../../../packages/jsr/model/src/utils/lo-utils";

/**
 * Icon library tests.
 *
 * The Tutors reader supports 4 icon libraries (Fluent with 84 icons, Hero,
 * Lucide, and LA). The loadIcon function from lo-utils extracts icon
 * configuration from a learning object's frontMatter.
 */

function makeLo(overrides: Record<string, unknown> = {}): any {
  return {
    type: "note",
    id: "lo-1",
    title: "Test LO",
    summary: "",
    contentMd: "",
    route: "/course/topic/lo-1",
    authLevel: 0,
    img: "",
    video: "",
    hide: false,
    ...overrides,
  };
}

describe("icon-libraries: loadIcon with frontMatter.icon set", () => {
  it("returns an object with type and color", () => {
    const lo = makeLo({
      frontMatter: {
        icon: { type: "fluent:book-24-filled", color: "#3b82f6" },
      },
    });
    const icon = loadIcon(lo);
    expect(icon).toBeDefined();
    expect(icon!.type).toBe("fluent:book-24-filled");
    expect(icon!.color).toBe("#3b82f6");
  });

  it("returns correct type for hero icon", () => {
    const lo = makeLo({
      frontMatter: {
        icon: { type: "heroicons:academic-cap", color: "#10b981" },
      },
    });
    const icon = loadIcon(lo);
    expect(icon).toBeDefined();
    expect(icon!.type).toBe("heroicons:academic-cap");
  });

  it("returns correct type for lucide icon", () => {
    const lo = makeLo({
      frontMatter: {
        icon: { type: "lucide:code", color: "#6366f1" },
      },
    });
    const icon = loadIcon(lo);
    expect(icon!.type).toBe("lucide:code");
  });

  it("returns correct type for la (line-awesome) icon", () => {
    const lo = makeLo({
      frontMatter: {
        icon: { type: "la:laptop-code", color: "#f59e0b" },
      },
    });
    const icon = loadIcon(lo);
    expect(icon!.type).toBe("la:laptop-code");
  });
});

describe("icon-libraries: loadIcon with no frontMatter", () => {
  it("returns undefined when frontMatter is missing", () => {
    const lo = makeLo({ frontMatter: undefined });
    const icon = loadIcon(lo);
    expect(icon).toBeUndefined();
  });

  it("returns undefined when frontMatter is null", () => {
    const lo = makeLo({ frontMatter: null });
    const icon = loadIcon(lo);
    expect(icon).toBeUndefined();
  });
});

describe("icon-libraries: loadIcon with frontMatter but no icon", () => {
  it("returns undefined when frontMatter exists but has no icon property", () => {
    const lo = makeLo({ frontMatter: { order: 1 } });
    const icon = loadIcon(lo);
    expect(icon).toBeUndefined();
  });

  it("returns undefined when frontMatter.icon is undefined", () => {
    const lo = makeLo({ frontMatter: { icon: undefined } });
    const icon = loadIcon(lo);
    expect(icon).toBeUndefined();
  });
});
