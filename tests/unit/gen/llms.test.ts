import { describe, it, expect, vi } from "vitest";

/**
 * Tests for packages/jsr/gen/src/utils/llms.ts
 *
 * Covers the pure toSnakeCase utility and the generateLlms early-exit guard.
 */

// Mock file-utils and model-lib before importing the module under test
vi.mock("@tutors/tutors-model-lib", () => ({
  filterByType: vi.fn().mockReturnValue([]),
  flattenLos: vi.fn().mockReturnValue([]),
  removeLeadingHashes: vi.fn((s: string) => s),
}));

vi.mock("../../../packages/jsr/gen/src/utils/file-utils.ts", () => ({
  writeFile: vi.fn(),
  compressToZip: vi.fn(),
  removeFirstLine: vi.fn((s: string) => s),
}));

import { toSnakeCase, generateLlms } from "../../../packages/jsr/gen/src/utils/llms.ts";
import { writeFile, compressToZip } from "../../../packages/jsr/gen/src/utils/file-utils.ts";

// ---------------------------------------------------------------------------
// toSnakeCase (pure function)
// ---------------------------------------------------------------------------
describe("llms: toSnakeCase", () => {
  it("converts spaces to hyphens", () => {
    expect(toSnakeCase("hello world")).toBe("hello-world");
  });

  it("converts uppercase letters to lowercase", () => {
    expect(toSnakeCase("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(toSnakeCase("hello@world!")).toBe("helloworld");
  });

  it("preserves numbers", () => {
    expect(toSnakeCase("topic 42")).toBe("topic-42");
  });

  it("returns empty string for empty input", () => {
    expect(toSnakeCase("")).toBe("");
  });

  it("leaves already-kebab-case strings unchanged (hyphens are stripped as non-alphanumeric)", () => {
    // The regex [^a-z0-9\s] removes hyphens, so "hello-world" becomes "helloworld"
    expect(toSnakeCase("hello-world")).toBe("helloworld");
  });

  it("collapses multiple spaces into a single hyphen", () => {
    expect(toSnakeCase("hello   world")).toBe("hello-world");
  });

  it("handles mixed special characters and spaces", () => {
    // & is removed, surrounding spaces collapse via \s+ into a single hyphen
    expect(toSnakeCase("Web Dev & Design 101")).toBe("web-dev-design-101");
  });

  it("handles strings with only special characters", () => {
    expect(toSnakeCase("!@#$%")).toBe("");
  });

  it("handles strings with leading and trailing spaces", () => {
    expect(toSnakeCase("  hello  ")).toBe("-hello-");
  });
});

// ---------------------------------------------------------------------------
// generateLlms (early-exit guard)
// ---------------------------------------------------------------------------

function makeCourse(overrides: Record<string, unknown> = {}): any {
  return {
    type: "course",
    title: "Test Course",
    contentMd: "# Test\nSome content",
    los: [],
    properties: { credits: "Lecturer Name", llm: 0, ...overrides.properties as Record<string, unknown> },
    ...overrides,
  };
}

describe("llms: generateLlms early-exit guard", () => {
  it("returns early without writing files when llm is 0", () => {
    vi.mocked(writeFile).mockClear();
    vi.mocked(compressToZip).mockClear();

    const course = makeCourse({ properties: { credits: "Author", llm: 0 } });
    generateLlms(course, "/output");

    expect(writeFile).not.toHaveBeenCalled();
    expect(compressToZip).not.toHaveBeenCalled();
  });

  it("returns early without writing files when llm is undefined", () => {
    vi.mocked(writeFile).mockClear();
    vi.mocked(compressToZip).mockClear();

    const course = makeCourse({ properties: { credits: "Author" } });
    generateLlms(course, "/output");

    expect(writeFile).not.toHaveBeenCalled();
    expect(compressToZip).not.toHaveBeenCalled();
  });
});
