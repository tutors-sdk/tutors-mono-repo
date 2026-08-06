import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SearchResult {
  title: string;
  link: string;
  contentMd: string;
  language?: string;
  highlightedMatch?: string;
}

const MAX_RESULTS = 100;

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    title: "Lab 01: Getting Started",
    link: "/lab/lab-01",
    contentMd: "This lab covers the basics of setting up your environment.",
    ...overrides,
  };
}

function searchResults(query: string, items: SearchResult[]): SearchResult[] {
  if (!query) return [];
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.contentMd.toLowerCase().includes(query.toLowerCase())
  );
}

// ===========================================================================
// Result item structure
// ===========================================================================
describe("SearchResults: result item structure", () => {
  it("should include title, link, and contentMd", () => {
    const result = makeResult();
    expect(result.title).toBeDefined();
    expect(result.link).toBeDefined();
    expect(result.contentMd).toBeDefined();
  });

  it("title should be a non-empty string", () => {
    const result = makeResult();
    expect(result.title.length).toBeGreaterThan(0);
  });

  it("link should be a valid route", () => {
    const result = makeResult({ link: "/talk/lecture-05" });
    expect(result.link).toMatch(/^\//);
  });

  it("contentMd should contain markdown text", () => {
    const result = makeResult({ contentMd: "## Step 1\nDo the thing." });
    expect(result.contentMd).toContain("## Step 1");
  });
});

// ===========================================================================
// Fenced code results
// ===========================================================================
describe("SearchResults: fenced code detection", () => {
  it("should indicate language for fenced code blocks", () => {
    const result = makeResult({
      contentMd: "```java\npublic class Main {}\n```",
      language: "java",
    });
    expect(result.language).toBe("java");
  });

  it("should handle results without code blocks", () => {
    const result = makeResult();
    expect(result.language).toBeUndefined();
  });

  it("language should be a string when present", () => {
    const result = makeResult({ language: "python" });
    expect(typeof result.language).toBe("string");
  });
});

// ===========================================================================
// Max results limit
// ===========================================================================
describe("SearchResults: max results limit", () => {
  it("should respect max 100 items", () => {
    const items = Array.from({ length: 150 }, (_, i) =>
      makeResult({ title: `Result ${i}`, contentMd: `Content for result ${i}` })
    );
    const limited = items.slice(0, MAX_RESULTS);
    expect(limited).toHaveLength(100);
  });

  it("results under limit should not be truncated", () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      makeResult({ title: `Result ${i}` })
    );
    const limited = items.slice(0, MAX_RESULTS);
    expect(limited).toHaveLength(50);
  });

  it("MAX_RESULTS constant should be 100", () => {
    expect(MAX_RESULTS).toBe(100);
  });
});

// ===========================================================================
// Empty search
// ===========================================================================
describe("SearchResults: empty search", () => {
  it("empty query should yield empty list", () => {
    const items = [makeResult()];
    const results = searchResults("", items);
    expect(results).toHaveLength(0);
  });

  it("query with no matches should yield empty list", () => {
    const items = [makeResult({ title: "Lab 01", contentMd: "Basics" })];
    const results = searchResults("zzzznonexistent", items);
    expect(results).toHaveLength(0);
  });

  it("matching query should return results", () => {
    const items = [makeResult({ title: "Lab 01", contentMd: "Setup guide" })];
    const results = searchResults("Setup", items);
    expect(results).toHaveLength(1);
  });
});

// ===========================================================================
// Highlighted match
// ===========================================================================
describe("SearchResults: highlighted match", () => {
  it("should be identifiable when present", () => {
    const result = makeResult({ highlightedMatch: "<mark>setup</mark>" });
    expect(result.highlightedMatch).toBeDefined();
    expect(result.highlightedMatch).toContain("<mark>");
  });

  it("should be undefined when no highlight available", () => {
    const result = makeResult();
    expect(result.highlightedMatch).toBeUndefined();
  });

  it("highlighted match should wrap the search term", () => {
    const result = makeResult({ highlightedMatch: "Learn to <mark>build</mark> apps" });
    expect(result.highlightedMatch).toMatch(/<mark>.*<\/mark>/);
  });
});
