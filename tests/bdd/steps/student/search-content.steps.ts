import { describe, it, expect, beforeEach } from "vitest";
import { searchHits, extractPath, isValid } from "../../../../packages/jsr/model/src/services/search";
import { TestWorld } from "../../support/world";

describe("Student: Content Search", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall return results matching search term across learning objects", () => {
    const lo1 = {
      type: "lab",
      id: "lab-1",
      title: "Lab 1",
      summary: "",
      contentMd: "Introduction\nThis function returns a value\nEnd of lab",
      route: "/lab-1",
      authLevel: 0,
      img: "",
      imgFile: "",
      video: "",
      videoids: { videoIds: [] },
      hide: false,
      frontMatter: {},
      parentLo: { title: "Topic 1" },
    };

    const results = searchHits([lo1 as any], "function");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].contentMd).toContain("function");
  });

  it("shall identify fenced code block matches", () => {
    const lo = {
      type: "lab",
      id: "lab-2",
      title: "Lab 2",
      summary: "",
      contentMd: "Some text\n```javascript\nconst x = 42;\n```\nMore text",
      route: "/lab-2",
      authLevel: 0,
      img: "",
      imgFile: "",
      video: "",
      videoids: { videoIds: [] },
      hide: false,
      frontMatter: {},
      parentLo: { title: "Topic 1" },
    };

    const results = searchHits([lo as any], "const x");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].fenced).toBe(true);
    expect(results[0].language).toBe("javascript");
  });

  it("shall return at most 100 results", () => {
    const lotsOfContent = Array(150)
      .fill("match ")
      .map((s, i) => `${s}${i}\n`)
      .join("");
    const lo = {
      type: "note",
      id: "note-1",
      title: "Note",
      summary: "",
      contentMd: lotsOfContent,
      route: "/note-1",
      authLevel: 0,
      img: "",
      imgFile: "",
      video: "",
      videoids: { videoIds: [] },
      hide: false,
      frontMatter: {},
      parentLo: { title: "Topic" },
    };

    const results = searchHits([lo as any], "match");
    expect(results.length).toBeLessThanOrEqual(100);
  });

  it("shall return empty array when no matches found", () => {
    const lo = {
      type: "note",
      id: "note-2",
      title: "Note",
      summary: "",
      contentMd: "Hello world",
      route: "/note-2",
      authLevel: 0,
      img: "",
      imgFile: "",
      video: "",
      videoids: { videoIds: [] },
      hide: false,
      frontMatter: {},
      parentLo: { title: "Topic" },
    };

    const results = searchHits([lo as any], "xyznonexistent");
    expect(results).toHaveLength(0);
  });

  it("shall produce links that do not start with hash", () => {
    const lo = {
      type: "lab",
      id: "lab-3",
      title: "Lab 3",
      summary: "",
      contentMd: "Content with searchable text",
      route: "/lab-3",
      authLevel: 0,
      img: "",
      imgFile: "",
      video: "",
      videoids: { videoIds: [] },
      hide: false,
      frontMatter: {},
      parentLo: { title: "Topic" },
    };

    const results = searchHits([lo as any], "searchable");
    if (results.length > 0) {
      expect(results[0].link).not.toMatch(/^#/);
    }
  });
});
