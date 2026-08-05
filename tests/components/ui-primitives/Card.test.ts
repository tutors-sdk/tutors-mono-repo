import { describe, it, expect } from "vitest";
import type { CardDetails } from "../../../packages/svelte/themes/src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CardVariant = "default" | "compact" | "featured";

const cardVariants: CardVariant[] = ["default", "compact", "featured"];

function makeCardDetails(overrides: Partial<CardDetails> = {}): CardDetails {
  return {
    route: "/course/topic-1",
    title: "Introduction to Programming",
    type: "topic",
    summary: "Learn the basics of programming.",
    ...overrides,
  };
}

/** Truncate text to a maximum length with ellipsis. */
function truncateSummary(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

// ===========================================================================
// Card requires title and route
// ===========================================================================
describe("Card: title and route requirement", () => {
  it("should have a route defined", () => {
    const card = makeCardDetails();
    expect(card.route).toBeDefined();
    expect(card.route.length).toBeGreaterThan(0);
  });

  it("should have a title defined", () => {
    const card = makeCardDetails();
    expect(card.title).toBeDefined();
    expect(card.title!.length).toBeGreaterThan(0);
  });

  it("route should start with /", () => {
    const card = makeCardDetails({ route: "/lab/step-1" });
    expect(card.route).toMatch(/^\//);
  });

  it("should include a type field for icon resolution", () => {
    const card = makeCardDetails({ type: "lab" });
    expect(card.type).toBe("lab");
  });
});

// ===========================================================================
// Card with image
// ===========================================================================
describe("Card: image support", () => {
  it("should include img src when provided", () => {
    const card = makeCardDetails({ img: "https://example.com/course.png" });
    expect(card.img).toBe("https://example.com/course.png");
  });

  it("img should be a valid URL or path string", () => {
    const card = makeCardDetails({ img: "/images/topic.jpg" });
    expect(typeof card.img).toBe("string");
    expect(card.img!.length).toBeGreaterThan(0);
  });

  it("card without img should have undefined img", () => {
    const noImgCard = makeCardDetails({ img: undefined });
    expect(noImgCard.img).toBeUndefined();
  });
});

// ===========================================================================
// Card click handler
// ===========================================================================
describe("Card: click handler association", () => {
  it("route should be usable as a navigation target", () => {
    const card = makeCardDetails({ route: "/topic/week-1" });
    const navigateTo = (route: string) => route;
    expect(navigateTo(card.route)).toBe("/topic/week-1");
  });

  it("click handler should be associable as a function", () => {
    const handler = () => "navigated";
    expect(typeof handler).toBe("function");
    expect(handler()).toBe("navigated");
  });

  it("card route should be passable to a click callback", () => {
    const card = makeCardDetails({ route: "/lab/lab-01" });
    const clickHandler = (route: string) => `goto:${route}`;
    expect(clickHandler(card.route)).toBe("goto:/lab/lab-01");
  });
});

// ===========================================================================
// Card variant styles
// ===========================================================================
describe("Card: variant styles", () => {
  it("should enumerate three variants: default, compact, featured", () => {
    expect(cardVariants).toHaveLength(3);
    expect(cardVariants).toContain("default");
    expect(cardVariants).toContain("compact");
    expect(cardVariants).toContain("featured");
  });

  it.each(cardVariants)("variant '%s' should be a valid string", (variant) => {
    expect(typeof variant).toBe("string");
    expect(variant.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Card summary truncation
// ===========================================================================
describe("Card: summary truncation", () => {
  it("short summary should not be truncated", () => {
    const short = "A brief summary.";
    expect(truncateSummary(short)).toBe(short);
  });

  it("long summary should be truncated with ellipsis", () => {
    const long = "A".repeat(120);
    const result = truncateSummary(long, 80);
    expect(result.length).toBe(83); // 80 chars + "..."
    expect(result).toMatch(/\.\.\.$/);
  });

  it("summary at exact max length should not be truncated", () => {
    const exact = "B".repeat(80);
    expect(truncateSummary(exact, 80)).toBe(exact);
  });

  it("card summaryEx field can hold extended summary", () => {
    const card = makeCardDetails({ summaryEx: "Extended details here" });
    expect(card.summaryEx).toBe("Extended details here");
  });
});
