import { describe, expect, it } from "vitest";
import { LO_COMPOSITE_TYPES, LO_SIMPLE_TYPES, LO_TYPE_ORDER, LO_TYPES, isLoCompositeType, isLoType } from "../../../packages/domain/src/course/vocabulary.ts";
import { isCompositeLo, loCompositeTypes, loTypes, preOrder, simpleTypes } from "../../../packages/domain/src/course/types/type-utils.ts";
import { FluentIconLib } from "../../../packages/adapters/driving/themes/src/icons/fluent-icons.ts";
import { HeroIconLib } from "../../../packages/adapters/driving/themes/src/icons/hero-icons.ts";
import { EasterIcons } from "../../../packages/adapters/driving/themes/src/icons/easter-icons.ts";
import { FestiveIcons } from "../../../packages/adapters/driving/themes/src/icons/festive-icons.ts";
import { getIconType, icons, loBackgroundColour, loBorderColour, loColours } from "../../../packages/jsr/gen/src/templates/styles.ts";

/**
 * A learning-object kind is named once, in the domain's vocabulary. Everything else that lists kinds
 * (model-lib's lists and build order, the themes' icons, the static generator's palette) is either
 * derived from it or checked against it here, so a new kind cannot land half-wired.
 */
describe("the learning-object vocabulary", () => {
  it("names each kind once", () => {
    expect(new Set(LO_TYPES).size).toBe(LO_TYPES.length);
    expect(LO_TYPES).toEqual([...LO_SIMPLE_TYPES, ...LO_COMPOSITE_TYPES]);
    expect(LO_SIMPLE_TYPES.filter((type) => (LO_COMPOSITE_TYPES as readonly string[]).includes(type))).toEqual([]);
  });

  it("recognises its own kinds and nothing else", () => {
    for (const type of LO_TYPES) expect(isLoType(type)).toBe(true);
    for (const value of ["", "Lab", "video", 7, null, undefined]) expect(isLoType(value)).toBe(false);
    for (const type of LO_TYPES) expect(isLoCompositeType(type)).toBe((LO_COMPOSITE_TYPES as readonly string[]).includes(type));
  });

  it("gives every kind one place in the build order, containers first", () => {
    expect(Object.keys(LO_TYPE_ORDER).sort()).toEqual([...LO_TYPES].sort());
    const ranks = Object.values(LO_TYPE_ORDER).sort((a, b) => a - b);
    expect(ranks).toEqual(LO_TYPES.map((_, index) => index));
    const lastContainer = Math.max(...LO_COMPOSITE_TYPES.map((type) => LO_TYPE_ORDER[type]));
    const firstContent = Math.min(...LO_SIMPLE_TYPES.map((type) => LO_TYPE_ORDER[type]));
    expect(lastContainer).toBeLessThan(firstContent);
    expect(LO_TYPE_ORDER.course).toBe(0);
  });

  it("is what model-lib's lists and build order are made of", () => {
    expect(simpleTypes).toEqual([...LO_SIMPLE_TYPES]);
    expect(loCompositeTypes).toEqual([...LO_COMPOSITE_TYPES]);
    expect(loTypes).toEqual([...LO_TYPES]);
    expect([...preOrder.entries()].sort()).toEqual(Object.entries(LO_TYPE_ORDER).sort());
    for (const type of LO_TYPES) expect(isCompositeLo({ type } as never)).toBe(isLoCompositeType(type));
  });

  it("model-lib's lists are copies, so a caller that sorts or extends one cannot change the vocabulary", () => {
    expect(simpleTypes).not.toBe(LO_SIMPLE_TYPES);
    expect(loTypes).not.toBe(LO_TYPES);
  });
});

describe("the themes against the vocabulary", () => {
  /** `book` is the folder a lab's steps live in; no theme draws it as a card, so none has an icon for it. */
  const withoutIcon = ["book"];
  const drawn = LO_TYPES.filter((type) => !withoutIcon.includes(type));

  it("the default icon library has an icon for every kind a theme draws", () => {
    expect(drawn.filter((type) => !FluentIconLib[type])).toEqual([]);
    expect(withoutIcon.filter((type) => FluentIconLib[type])).toEqual([]);
  });

  it("every other library has its own icon or leaves the kind to the default library", () => {
    for (const library of [HeroIconLib, EasterIcons, FestiveIcons]) {
      for (const type of drawn) {
        const icon = library[type] ?? FluentIconLib[type];
        expect(icon?.type, type).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/);
        expect(icon?.color, type).toBeTruthy();
      }
    }
  });
});

describe("the static generator against the vocabulary", () => {
  /** Kinds the static site has no card palette for; they are drawn with the course's. */
  const withoutPalette = ["book", "whiteboard"];
  const drawn = LO_TYPES.filter((type) => !withoutPalette.includes(type));

  it("has an icon and a card colour for every kind it draws", () => {
    expect(drawn.filter((type) => !(type in icons))).toEqual([]);
    expect(drawn.filter((type) => !(type in loColours))).toEqual([]);
    expect(withoutPalette.filter((type) => type in icons || type in loColours)).toEqual([]);
  });

  it("draws a kind it has no palette for with the course's icon and colours", () => {
    for (const type of withoutPalette) {
      expect(getIconType(type as never)).toBe(icons.course);
      expect(loBorderColour(type as never)).toBe(loColours.course.border);
      expect(loBackgroundColour(type as never)).toBe(loColours.course.background);
    }
  });
});
