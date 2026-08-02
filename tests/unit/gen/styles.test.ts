import { describe, it, expect } from "vitest";
import {
  icons,
  colours,
  backgroundColours,
  getIconType,
  loColours,
  loBorderColour,
  loBackgroundColour,
} from "../../../packages/jsr/gen/src/templates/styles";
import type { IconType } from "../../../packages/jsr/gen/src/templates/styles";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** All keys present in the `icons` map. */
const iconKeys = Object.keys(icons) as IconType[];

/** All keys present in the `loColours` map. */
const loColourKeys = Object.keys(loColours) as IconType[];

// ===========================================================================
// icons
// ===========================================================================
describe("icons", () => {
  it("contains expected core LO type keys", () => {
    const expected: IconType[] = [
      "course", "topic", "talk", "reference", "lab",
      "archive", "video", "github", "web", "note",
      "unit", "side", "tutorial",
    ];
    expected.forEach((key) => {
      expect(icons).toHaveProperty(key);
    });
  });

  it("contains panel-level keys", () => {
    expect(icons).toHaveProperty("paneltalk");
    expect(icons).toHaveProperty("panelvideo");
    expect(icons).toHaveProperty("panelnote");
  });

  it("contains companion / external service keys", () => {
    (["moodle", "slack", "youtube", "zoom", "teams"] as IconType[]).forEach((key) => {
      expect(icons).toHaveProperty(key);
    });
  });

  it("every value is a non-empty string (Iconify icon ID)", () => {
    iconKeys.forEach((key) => {
      expect(typeof icons[key]).toBe("string");
      expect(icons[key].length).toBeGreaterThan(0);
    });
  });

  it("no value is undefined", () => {
    iconKeys.forEach((key) => {
      expect(icons[key]).toBeDefined();
    });
  });
});

// ===========================================================================
// colours
// ===========================================================================
describe("colours", () => {
  const colourKeys = Object.keys(colours) as Array<keyof typeof colours>;

  it("maps every key to a valid hex colour", () => {
    colourKeys.forEach((key) => {
      expect(colours[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it("has entries for all simple LO types used in cards", () => {
    const expected: Array<keyof typeof colours> = [
      "course", "topic", "talk", "reference", "lab",
      "video", "github", "web", "note", "tutorial",
    ];
    expected.forEach((key) => {
      expect(colours).toHaveProperty(key);
    });
  });

  it("contains no undefined values", () => {
    colourKeys.forEach((key) => {
      expect(colours[key]).toBeDefined();
    });
  });
});

// ===========================================================================
// backgroundColours
// ===========================================================================
describe("backgroundColours", () => {
  const bgKeys = Object.keys(backgroundColours) as Array<keyof typeof backgroundColours>;

  it("maps every key to a valid hex colour", () => {
    bgKeys.forEach((key) => {
      expect(backgroundColours[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it("has entries for side and unit types", () => {
    expect(backgroundColours).toHaveProperty("side");
    expect(backgroundColours).toHaveProperty("unit");
  });

  it("contains no undefined values", () => {
    bgKeys.forEach((key) => {
      expect(backgroundColours[key]).toBeDefined();
    });
  });
});

// ===========================================================================
// getIconType
// ===========================================================================
describe("getIconType", () => {
  it("returns the correct icon for a known type", () => {
    expect(getIconType("lab")).toBe(icons.lab);
    expect(getIconType("talk")).toBe(icons.talk);
    expect(getIconType("course")).toBe(icons.course);
  });

  it("returns icons.course as fallback for an unknown type", () => {
    const result = getIconType("nonexistent" as IconType);
    expect(result).toBe(icons.course);
  });

  it("returns a string for every known icon key", () => {
    iconKeys.forEach((key) => {
      const result = getIconType(key);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

// ===========================================================================
// loColours
// ===========================================================================
describe("loColours", () => {
  it("every entry has border and background properties", () => {
    loColourKeys.forEach((key) => {
      const entry = loColours[key];
      expect(entry).toHaveProperty("border");
      expect(entry).toHaveProperty("background");
    });
  });

  it("border and background are valid hex colours", () => {
    loColourKeys.forEach((key) => {
      expect(loColours[key].border).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(loColours[key].background).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it("covers all keys that appear in the icons map", () => {
    iconKeys.forEach((key) => {
      expect(loColours).toHaveProperty(key);
    });
  });

  it("has distinct border and background for topic type", () => {
    expect(loColours.topic.border).not.toBe(loColours.topic.background);
  });

  it("has matching border and background for course type", () => {
    expect(loColours.course.border).toBe(loColours.course.background);
  });
});

// ===========================================================================
// loBorderColour
// ===========================================================================
describe("loBorderColour", () => {
  it("returns the border colour from loColours for a given type", () => {
    expect(loBorderColour("lab")).toBe(loColours.lab.border);
    expect(loBorderColour("talk")).toBe(loColours.talk.border);
  });

  it("returns a valid hex colour string", () => {
    loColourKeys.forEach((key) => {
      expect(loBorderColour(key)).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});

// ===========================================================================
// loBackgroundColour
// ===========================================================================
describe("loBackgroundColour", () => {
  it("returns the background colour from loColours for a given type", () => {
    expect(loBackgroundColour("lab")).toBe(loColours.lab.background);
    expect(loBackgroundColour("topic")).toBe(loColours.topic.background);
  });

  it("returns a valid hex colour string", () => {
    loColourKeys.forEach((key) => {
      expect(loBackgroundColour(key)).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});
