import { describe, it, expect } from "vitest";
import { isMarpContent, buildMarpMarkdown, renderMarpSlides } from "../../../packages/svelte/course/src/markdown/services/marp-renderer";

function makeLo(overrides: Record<string, any> = {}): any {
  return {
    type: "note",
    id: "test-lo",
    title: "Test",
    summary: "",
    contentMd: "",
    frontMatter: {},
    route: "/note/test",
    authLevel: 0,
    img: "",
    imgFile: "",
    video: "",
    videoids: {},
    hide: false,
    ...overrides
  };
}

describe("isMarpContent", () => {
  it("returns true when frontMatter.marp is boolean true", () => {
    const lo = makeLo({ frontMatter: { marp: true } });
    expect(isMarpContent(lo)).toBe(true);
  });

  it("returns true when frontMatter.marp is string 'true'", () => {
    const lo = makeLo({ frontMatter: { marp: "true" } });
    expect(isMarpContent(lo)).toBe(true);
  });

  it("returns true when frontMatter.marp is string 'True' (case-insensitive)", () => {
    const lo = makeLo({ frontMatter: { marp: "True" } });
    expect(isMarpContent(lo)).toBe(true);
  });

  it("returns false when frontMatter.marp is 'false'", () => {
    const lo = makeLo({ frontMatter: { marp: "false" } });
    expect(isMarpContent(lo)).toBe(false);
  });

  it("returns false when frontMatter has no marp key", () => {
    const lo = makeLo({ frontMatter: { theme: "default" } });
    expect(isMarpContent(lo)).toBe(false);
  });

  it("returns true via regex fallback when contentMd has marp frontmatter", () => {
    const lo = makeLo({
      frontMatter: {},
      contentMd: "---\nmarp: true\n---\n# Slide 1"
    });
    expect(isMarpContent(lo)).toBe(true);
  });

  it("returns false via regex when contentMd has frontmatter without marp", () => {
    const lo = makeLo({
      frontMatter: {},
      contentMd: "---\ntheme: gaia\n---\n# Slide 1"
    });
    expect(isMarpContent(lo)).toBe(false);
  });

  it("returns false when contentMd is empty", () => {
    const lo = makeLo({ frontMatter: {}, contentMd: "" });
    expect(isMarpContent(lo)).toBe(false);
  });

  it("returns false when contentMd has no frontmatter", () => {
    const lo = makeLo({ frontMatter: {}, contentMd: "# Just a heading" });
    expect(isMarpContent(lo)).toBe(false);
  });

  it("returns false when frontMatter is null and contentMd is plain", () => {
    const lo = makeLo({ frontMatter: null, contentMd: "some text" });
    expect(isMarpContent(lo)).toBe(false);
  });
});

describe("buildMarpMarkdown", () => {
  it("returns contentMd unchanged when it already starts with frontmatter", () => {
    const md = "---\nmarp: true\ntheme: gaia\n---\n# Slide";
    const lo = makeLo({ contentMd: md });
    expect(buildMarpMarkdown(lo)).toBe(md);
  });

  it("returns contentMd unchanged when it starts with leading whitespace then frontmatter", () => {
    const md = "  ---\nmarp: true\n---\n# Slide";
    const lo = makeLo({ contentMd: md });
    expect(buildMarpMarkdown(lo)).toBe(md);
  });

  it("prepends frontmatter with marp:true when contentMd lacks frontmatter", () => {
    const lo = makeLo({ frontMatter: {}, contentMd: "# Slide 1\nHello" });
    const result = buildMarpMarkdown(lo);
    expect(result).toContain("---\nmarp: true\n---");
    expect(result).toContain("# Slide 1\nHello");
  });

  it("includes theme in generated frontmatter when present", () => {
    const lo = makeLo({
      frontMatter: { theme: "gaia" },
      contentMd: "# Slide"
    });
    const result = buildMarpMarkdown(lo);
    expect(result).toContain("theme: gaia");
    expect(result).toContain("marp: true");
  });

  it("includes paginate in generated frontmatter when present", () => {
    const lo = makeLo({
      frontMatter: { paginate: "true" },
      contentMd: "# Slide"
    });
    const result = buildMarpMarkdown(lo);
    expect(result).toContain("paginate: true");
  });

  it("includes both theme and paginate when both present", () => {
    const lo = makeLo({
      frontMatter: { theme: "uncover", paginate: "true" },
      contentMd: "# Slide"
    });
    const result = buildMarpMarkdown(lo);
    expect(result).toContain("theme: uncover");
    expect(result).toContain("paginate: true");
    expect(result).toContain("marp: true");
  });

  it("handles null frontMatter by generating minimal frontmatter", () => {
    const lo = makeLo({ frontMatter: null, contentMd: "# Slide" });
    const result = buildMarpMarkdown(lo);
    expect(result).toContain("---\nmarp: true\n---");
    expect(result).toContain("# Slide");
  });

  it("generated frontmatter ends with separator before content", () => {
    const lo = makeLo({ frontMatter: {}, contentMd: "Content here" });
    const result = buildMarpMarkdown(lo);
    expect(result).toContain("---\nContent here");
    expect(result.endsWith("Content here")).toBe(true);
  });
});

describe("renderMarpSlides", () => {
  it("returns html and css properties", () => {
    const result = renderMarpSlides("# Slide 1");
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("css");
  });

  it("wraps slide content in section tags", () => {
    const result = renderMarpSlides("# Test slide");
    expect(result.html).toContain("<section");
    expect(result.html).toContain("</section>");
  });

  it("renders markdown headings into HTML", () => {
    const result = renderMarpSlides("# Test slide");
    expect(result.html).toContain("Test slide");
    expect(result.html).toContain("<h1");
  });

  it("renders paragraph content", () => {
    const result = renderMarpSlides("Some paragraph text");
    expect(result.html).toContain("Some paragraph text");
    expect(result.html).toContain("<section");
  });

  it("produces real CSS", () => {
    const result = renderMarpSlides("# Slide 1");
    expect(typeof result.css).toBe("string");
    expect(result.css.length).toBeGreaterThan(100);
  });

  it("renders multiple slides separated by ---", () => {
    const result = renderMarpSlides("# Slide 1\n\n---\n\n# Slide 2");
    expect(result.html).toContain("Slide 1");
    expect(result.html).toContain("Slide 2");
  });
});
