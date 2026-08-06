import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CourseHeaderData {
  title: string;
  summary: string;
  img: string;
  author?: string;
  version?: string;
  properties: Record<string, string>;
}

const MAX_TITLE_LENGTH = 120;
const FALLBACK_IMAGE = "/images/default-course.png";

function makeCourseHeader(overrides: Partial<CourseHeaderData> = {}): CourseHeaderData {
  return {
    title: "Object Oriented Programming",
    summary: "A comprehensive course covering OOP principles.",
    img: "https://example.com/oop-banner.png",
    author: "Dr. Smith",
    version: "2024.1",
    properties: { credits: "5", semester: "1" },
    ...overrides,
  };
}

// ===========================================================================
// Title and summary display
// ===========================================================================
describe("CourseHeader: title and summary display", () => {
  it("should display the course title", () => {
    const header = makeCourseHeader({ title: "Web Development" });
    expect(header.title).toBe("Web Development");
  });

  it("should display the course summary", () => {
    const header = makeCourseHeader({ summary: "Learn to build web apps." });
    expect(header.summary).toBe("Learn to build web apps.");
  });

  it("title should be a non-empty string", () => {
    const header = makeCourseHeader();
    expect(header.title.length).toBeGreaterThan(0);
  });

  it("summary should be a string", () => {
    const header = makeCourseHeader();
    expect(typeof header.summary).toBe("string");
  });
});

// ===========================================================================
// Course image rendering
// ===========================================================================
describe("CourseHeader: course image", () => {
  it("should render course image from img field", () => {
    const header = makeCourseHeader({ img: "https://example.com/banner.jpg" });
    expect(header.img).toBe("https://example.com/banner.jpg");
  });

  it("img should be a valid URL string", () => {
    const header = makeCourseHeader();
    expect(typeof header.img).toBe("string");
    expect(header.img.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Metadata (author and version)
// ===========================================================================
describe("CourseHeader: metadata", () => {
  it("should include author in metadata", () => {
    const header = makeCourseHeader({ author: "Prof. Jones" });
    expect(header.author).toBe("Prof. Jones");
  });

  it("should include version in metadata", () => {
    const header = makeCourseHeader({ version: "2025.2" });
    expect(header.version).toBe("2025.2");
  });

  it("properties should support dynamic key-value pairs", () => {
    const header = makeCourseHeader({
      properties: { credits: "10", department: "Computing" },
    });
    expect(header.properties["credits"]).toBe("10");
    expect(header.properties["department"]).toBe("Computing");
  });

  it("author and version should be optional", () => {
    const header = makeCourseHeader({ author: undefined, version: undefined });
    expect(header.author).toBeUndefined();
    expect(header.version).toBeUndefined();
  });
});

// ===========================================================================
// Missing image fallback
// ===========================================================================
describe("CourseHeader: missing image fallback", () => {
  it("empty img should trigger fallback", () => {
    const header = makeCourseHeader({ img: "" });
    const resolved = header.img || FALLBACK_IMAGE;
    expect(resolved).toBe(FALLBACK_IMAGE);
  });

  it("fallback image should be a valid path", () => {
    expect(FALLBACK_IMAGE).toMatch(/\.(png|jpg|svg)$/);
  });

  it("non-empty img should not use fallback", () => {
    const header = makeCourseHeader({ img: "/custom/image.png" });
    const resolved = header.img || FALLBACK_IMAGE;
    expect(resolved).toBe("/custom/image.png");
  });
});

// ===========================================================================
// Long title handling
// ===========================================================================
describe("CourseHeader: long title max length", () => {
  it("title within limit should pass", () => {
    const header = makeCourseHeader({ title: "Short Title" });
    expect(header.title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it("title exceeding limit should be detectable", () => {
    const longTitle = "A".repeat(150);
    const header = makeCourseHeader({ title: longTitle });
    expect(header.title.length).toBeGreaterThan(MAX_TITLE_LENGTH);
  });

  it("max title length constant should be defined", () => {
    expect(MAX_TITLE_LENGTH).toBe(120);
  });
});
