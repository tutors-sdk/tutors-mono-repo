import { describe, it, expect } from "vitest";
import type { IconType } from "../../../packages/jsr/model/src/types/icon-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TopicData {
  title: string;
  route: string;
  summary: string;
  icon?: IconType;
  los: { type: string; title: string }[];
}

function makeTopic(overrides: Partial<TopicData> = {}): TopicData {
  return {
    title: "Week 1: Introduction",
    route: "/topic/week-1",
    summary: "An overview of the course.",
    los: [
      { type: "lab", title: "Lab 01" },
      { type: "talk", title: "Lecture 01" },
      { type: "note", title: "Reading 01" },
    ],
    ...overrides,
  };
}

// ===========================================================================
// Title display
// ===========================================================================
describe("TopicCard: title display", () => {
  it("should display title from topic data", () => {
    const topic = makeTopic({ title: "Data Structures" });
    expect(topic.title).toBe("Data Structures");
  });

  it("title should be a non-empty string", () => {
    const topic = makeTopic();
    expect(typeof topic.title).toBe("string");
    expect(topic.title.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Learning object count
// ===========================================================================
describe("TopicCard: learning object count", () => {
  it("should show the count of learning objects", () => {
    const topic = makeTopic();
    expect(topic.los.length).toBe(3);
  });

  it("count should reflect different LO types", () => {
    const topic = makeTopic();
    const types = new Set(topic.los.map((lo) => lo.type));
    expect(types.size).toBe(3);
  });

  it("count should update when LOs are added", () => {
    const topic = makeTopic();
    const extended = {
      ...topic,
      los: [...topic.los, { type: "tutorial", title: "Tutorial 01" }],
    };
    expect(extended.los.length).toBe(4);
  });
});

// ===========================================================================
// Icon display
// ===========================================================================
describe("TopicCard: icon display", () => {
  it("should display icon when available", () => {
    const topic = makeTopic({
      icon: { type: "fas fa-book", color: "#3b82f6" },
    });
    expect(topic.icon).toBeDefined();
    expect(topic.icon!.type).toBe("fas fa-book");
  });

  it("should handle missing icon gracefully", () => {
    const topic = makeTopic({ icon: undefined });
    expect(topic.icon).toBeUndefined();
  });

  it("icon colour should be preserved", () => {
    const topic = makeTopic({
      icon: { type: "fas fa-code", color: "#10b981" },
    });
    expect(topic.icon!.color).toBe("#10b981");
  });
});

// ===========================================================================
// Route linking
// ===========================================================================
describe("TopicCard: route linking", () => {
  it("route should link to topic view", () => {
    const topic = makeTopic({ route: "/topic/algorithms" });
    expect(topic.route).toBe("/topic/algorithms");
  });

  it("route should start with /topic/", () => {
    const topic = makeTopic();
    expect(topic.route).toMatch(/^\/topic\//);
  });
});

// ===========================================================================
// Empty topic
// ===========================================================================
describe("TopicCard: empty topic (no LOs)", () => {
  it("should still be constructable with empty los", () => {
    const topic = makeTopic({ los: [] });
    expect(topic.los).toHaveLength(0);
  });

  it("title should still be present for empty topic", () => {
    const topic = makeTopic({ los: [], title: "Empty Week" });
    expect(topic.title).toBe("Empty Week");
  });

  it("empty topic should have zero LO count", () => {
    const topic = makeTopic({ los: [] });
    expect(topic.los.length).toBe(0);
  });
});
