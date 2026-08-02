import { describe, it, expect } from "vitest";
import { searchHits, extractPath, isValid } from "../../../packages/jsr/model/src/services/search";

// ---------------------------------------------------------------------------
// Helper: build a minimal Lo object for testing
// ---------------------------------------------------------------------------
function makeLo(overrides: Record<string, unknown> = {}): any {
  return {
    type: "note",
    id: "lo-1",
    title: "## Test Lo",
    summary: "A test learning object",
    contentMd: "",
    route: "/course/topic/lo-1",
    authLevel: 0,
    img: "",
    video: "",
    hide: false,
    parentLo: { title: "Parent Topic" },
    ...overrides,
  };
}

// ===========================================================================
// searchHits
// ===========================================================================
describe("searchHits", () => {
  it("finds multiple occurrences of a term in unfenced content", () => {
    const lo = makeLo({
      contentMd: "The cat sat on the mat.\nThe cat napped.",
    });
    const results = searchHits([lo], "cat");
    expect(results.length).toBe(2);
    results.forEach((r) => {
      expect(r.fenced).toBe(false);
      expect(r.contentMd).toContain("cat");
    });
  });

  it("marks hits inside ``` fences as fenced and detects language", () => {
    const md = [
      "Some intro text",
      "```javascript",
      "const x = 42;",
      "```",
      "More text",
    ].join("\n");
    const lo = makeLo({ contentMd: md });
    const results = searchHits([lo], "42");
    expect(results.length).toBe(1);
    expect(results[0].fenced).toBe(true);
    expect(results[0].language).toBe("javascript");
  });

  it("marks hits inside ~~~ fences as fenced and detects language", () => {
    const md = [
      "Intro",
      "~~~python",
      "print('hello')",
      "~~~",
      "Outro",
    ].join("\n");
    const lo = makeLo({ contentMd: md });
    const results = searchHits([lo], "hello");
    expect(results.length).toBe(1);
    expect(results[0].fenced).toBe(true);
    expect(results[0].language).toBe("python");
  });

  it("returns unfenced for hits outside any fence", () => {
    const md = [
      "```ts",
      "let a = 1;",
      "```",
      "This is plain text with keyword here.",
    ].join("\n");
    const lo = makeLo({ contentMd: md });
    const results = searchHits([lo], "keyword");
    expect(results.length).toBe(1);
    expect(results[0].fenced).toBe(false);
  });

  it("returns an empty array when the search term is not found", () => {
    const lo = makeLo({ contentMd: "nothing relevant" });
    const results = searchHits([lo], "xyz");
    expect(results).toEqual([]);
  });

  it("returns an empty array when los array is empty", () => {
    const results = searchHits([], "anything");
    expect(results).toEqual([]);
  });

  it("skips Los with no contentMd", () => {
    const lo = makeLo({ contentMd: undefined });
    const results = searchHits([lo], "test");
    expect(results).toEqual([]);
  });

  it("truncates results to maxNumberHits (100)", () => {
    // Build content with >100 occurrences of the term on separate lines
    const lines = Array.from({ length: 120 }, (_, i) => `line${i} needle`);
    const lo = makeLo({ contentMd: lines.join("\n") });
    const results = searchHits([lo], "needle");
    expect(results.length).toBe(100);
  });

  it("populates title from parentLo and lo title", () => {
    const lo = makeLo({
      title: "## Step One",
      contentMd: "some content here",
      parentLo: { title: "Lab Exercises" },
    });
    const results = searchHits([lo], "content");
    expect(results[0].title).toBe("Lab Exercises/ Step One");
  });

  it("strips leading route slash from link", () => {
    const lo = makeLo({
      route: "/course/topic/note",
      contentMd: "hello world",
    });
    const results = searchHits([lo], "hello");
    expect(results[0].link).toBe("course/topic/note");
  });
});

// ===========================================================================
// extractPath
// ===========================================================================
describe("extractPath", () => {
  it("inserts / after # in a link string", () => {
    const input = '<a href="#lab/step1">Step 1</a>';
    const result = extractPath(input);
    expect(result).toBe("#/lab/step1");
  });

  it("handles a route-style href", () => {
    const input = '<a href="#topic/unit1">Unit 1</a>';
    const result = extractPath(input);
    expect(result).toBe("#/topic/unit1");
  });
});

// ===========================================================================
// isValid
// ===========================================================================
describe("isValid", () => {
  it("returns false for whitespace-only strings", () => {
    expect(isValid("   ")).toBe(false);
    expect(isValid("\t\n")).toBe(false);
  });

  it("returns true for strings with non-whitespace characters", () => {
    expect(isValid("hello")).toBe(true);
    expect(isValid("  a  ")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isValid("")).toBe(false);
  });
});
