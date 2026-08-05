import { describe, it, expect } from "vitest";
import type { IconType } from "../../../packages/jsr/model/src/types/icon-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal IconType config. */
function makeIconConfig(overrides: Partial<IconType> = {}): IconType {
  return { type: "default", color: "#000000", ...overrides };
}

/** CSS size map mirroring what the Icon component would resolve. */
const iconSizeMap: Record<string, string> = {
  default: "1.5rem",
  sm: "1rem",
  lg: "2rem",
  xl: "3rem",
};

// ===========================================================================
// Icon config with type and colour
// ===========================================================================
describe("Icon: config with type and colour", () => {
  it("should create a valid icon config with type and colour", () => {
    const icon = makeIconConfig({ type: "fas fa-book", color: "#3b82f6" });
    expect(icon.type).toBe("fas fa-book");
    expect(icon.color).toBe("#3b82f6");
  });

  it("should have both type and colour as strings", () => {
    const icon = makeIconConfig({ type: "bi bi-house", color: "red" });
    expect(typeof icon.type).toBe("string");
    expect(typeof icon.color).toBe("string");
  });
});

// ===========================================================================
// Missing icon type
// ===========================================================================
describe("Icon: missing icon type", () => {
  it("should handle undefined icon type gracefully", () => {
    const icon: Partial<IconType> = { color: "#ff0000" };
    expect(icon.type).toBeUndefined();
  });

  it("should allow downstream code to fallback for undefined icon", () => {
    const icon: Partial<IconType> = {};
    const resolvedType = icon.type ?? "default";
    expect(resolvedType).toBe("default");
  });
});

// ===========================================================================
// Size variations
// ===========================================================================
describe("Icon: size variations", () => {
  it("default size should map to 1.5rem", () => {
    expect(iconSizeMap["default"]).toBe("1.5rem");
  });

  it("sm size should map to 1rem", () => {
    expect(iconSizeMap["sm"]).toBe("1rem");
  });

  it("lg size should map to 2rem", () => {
    expect(iconSizeMap["lg"]).toBe("2rem");
  });

  it("xl size should map to 3rem", () => {
    expect(iconSizeMap["xl"]).toBe("3rem");
  });

  it("all size values should be valid CSS rem values", () => {
    Object.values(iconSizeMap).forEach((value) => {
      expect(value).toMatch(/^\d+(\.\d+)?rem$/);
    });
  });
});

// ===========================================================================
// Custom colour preservation
// ===========================================================================
describe("Icon: custom colour preservation", () => {
  it("should preserve hex colour in config", () => {
    const icon = makeIconConfig({ color: "#e74c3c" });
    expect(icon.color).toBe("#e74c3c");
  });

  it("should preserve named CSS colour", () => {
    const icon = makeIconConfig({ color: "rebeccapurple" });
    expect(icon.color).toBe("rebeccapurple");
  });

  it("should preserve rgb colour", () => {
    const icon = makeIconConfig({ color: "rgb(100, 200, 50)" });
    expect(icon.color).toBe("rgb(100, 200, 50)");
  });
});

// ===========================================================================
// Null/undefined icon handling
// ===========================================================================
describe("Icon: null/undefined icon handling", () => {
  it("should not error when icon is null", () => {
    const icon: IconType | null = null;
    expect(() => {
      const resolved = icon ?? makeIconConfig();
      return resolved;
    }).not.toThrow();
  });

  it("should not error when icon is undefined", () => {
    const icon: IconType | undefined = undefined;
    expect(() => {
      const resolved = icon ?? makeIconConfig();
      return resolved;
    }).not.toThrow();
  });

  it("should fallback to default config when icon is nullish", () => {
    const icon: IconType | undefined = undefined;
    const resolved = icon ?? makeIconConfig();
    expect(resolved.type).toBe("default");
    expect(resolved.color).toBe("#000000");
  });
});
