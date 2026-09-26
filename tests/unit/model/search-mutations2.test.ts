import { describe, it, expect } from "vitest";
import { searchHits } from "../../../packages/jsr/model/src/services/search";

// ---------------------------------------------------------------------------
// Helper: build a minimal Lo-compatible object
// ---------------------------------------------------------------------------
function makeLo(contentMd: string, overrides: Record<string, unknown> = {}): any {
  return { type: "lab", title: "## Lab", route: "/lab/cid/lab-1", contentMd, ...overrides };
}

function summarise(results: ReturnType<typeof searchHits>) {
  return results.map((r) => ({ fenced: r.fenced, language: r.language, contentMd: r.contentMd }));
}

// ===========================================================================
// 1. Result metadata
// ===========================================================================
describe("searchHits — result metadata", () => {
  it("builds the title from an absent parent as 'undefined' and strips title hashes", () => {
    const [hit] = searchHits([makeLo("hello world")], "world");
    expect(hit.title).toBe("undefined/ Lab");
    expect(hit.link).toBe("lab/cid/lab-1");
  });

  it("builds the title from the parent title when present", () => {
    const [hit] = searchHits([makeLo("hello world", { parentLo: { title: "Topic 1" } })], "world");
    expect(hit.title).toBe("Topic 1/ Lab");
  });
});

// ===========================================================================
// 2. Empty search term
// ===========================================================================
describe("searchHits — empty search term", () => {
  it("returns no hits for an empty search term", () => {
    expect(searchHits([makeLo("a\nb\nc")], "")).toEqual([]);
  });
});

// ===========================================================================
// 3. Mixed tilde and tick fences (fence indices must be numerically sorted)
// ===========================================================================
describe("searchHits — mixed fence types", () => {
  const content = "~~~js\nfoo\n~~~\ntext foo\n```py\nbar\n```\n";

  it("detects a term inside a tick fence that follows a tilde fence", () => {
    expect(summarise(searchHits([makeLo(content)], "bar"))).toEqual([
      { fenced: true, language: "py", contentMd: "\nbar" },
    ]);
  });

  it("distinguishes the fenced and unfenced occurrences before the tick fence", () => {
    expect(summarise(searchHits([makeLo(content)], "foo"))).toEqual([
      { fenced: true, language: "js", contentMd: "\nfoo" },
      { fenced: false, language: "", contentMd: "\ntext foo" },
    ]);
  });
});

// ===========================================================================
// 4. Terms that begin exactly on a fence or a separator
// ===========================================================================
describe("searchHits — terms at fence and separator boundaries", () => {
  it("treats an opening fence at index 0 as outside the fence", () => {
    expect(summarise(searchHits([makeLo("```js\ncode\n```\n")], "```"))).toEqual([
      { fenced: false, language: "", contentMd: "```js" },
      { fenced: true, language: "js", contentMd: "\n```" },
    ]);
  });

  it("uses the previous and next separators when the term starts with a newline", () => {
    expect(searchHits([makeLo("a\nb\nc")], "\nb").map((r) => r.contentMd)).toEqual(["a\nb"]);
  });
});
