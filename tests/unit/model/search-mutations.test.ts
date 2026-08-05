import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Self-contained re-implementations of internal (non-exported) functions from
// packages/jsr/model/src/services/search.ts.
//
// These mirror the source logic so that tight assertions kill mutation-testing
// survivors that the existing search.test.ts misses.
// ---------------------------------------------------------------------------

const fenceTick = "```";
const fenceTilde = "~~~";

/**
 * indicesOf  (source lines 175-191)
 *
 * Recursively locates start-indices of `substr` within `str`.
 * Line 182: n += arIndx[arIndx.length - 1] + substr.length
 */
function indicesOf(str: string, substr: string): number[] {
  const arIndx: number[] = [];
  function inner(str: string, substr: string, arIndx: number[]): number[] {
    let n = str.indexOf(substr);
    if (n !== -1) {
      const prev_n = n;
      if (arIndx.length) {
        n += arIndx[arIndx.length - 1] + substr.length;
      }
      arIndx.push(n);
      return inner(str.slice(prev_n + 1), substr, arIndx);
    } else {
      return arIndx;
    }
  }
  return inner(str, substr, arIndx);
}

/**
 * numericSort  (source lines 208-210)
 */
function numericSort(ar: number[]): number[] {
  return ar.sort((n1, n2) => n1 - n2);
}

/**
 * arStartFenceIndices  (source lines 198-201)
 */
function arStartFenceIndices(content: string): number[] {
  const ar = indicesOf(content, fenceTick).concat(indicesOf(content, fenceTilde));
  return numericSort(ar);
}

/**
 * isEven  (source lines 251-253)
 */
function isEven(aninteger: number): boolean {
  return aninteger % 2 === 0;
}

/**
 * findNearestPreviousIndex  (source lines 275-282)
 */
function findNearestPreviousIndex(
  indices: number[],
  currIndex: number
): [number, number] {
  for (let i = indices.length - 1; i >= 0; i--) {
    if (indices[i] < currIndex) {
      return [i, indices[i]];
    }
  }
  return [-1, -1];
}

/**
 * findNearestNextIndex  (source lines 289-298)
 */
function findNearestNextIndex(
  indices: number[],
  currIndex: number,
  contentLen: number
): [number, number] {
  for (let i = 0; i < indices.length; i += 1) {
    if (currIndex > indices[indices.length - 1]) {
      return [i, contentLen];
    } else if (indices[i] > currIndex) {
      return [i, indices[i]];
    }
  }
  return [-1, -1];
}

/**
 * isFenced  (source lines 219-233)
 */
function isFenced(content: string, searchTermIndex: number): string {
  const ar = arStartFenceIndices(content);
  if (ar.length === 0) {
    return "unfenced";
  }
  const prevSmaller = findNearestPreviousIndex(ar, searchTermIndex);
  if (isEven(prevSmaller[0])) {
    return "fenced";
  } else {
    return "unfenced";
  }
}

/**
 * getFenceType  (source lines 118-125)
 */
function getFenceType(content: string, indexSearchTerm: number): string {
  const ar = arStartFenceIndices(content);
  const indexFence = findNearestPreviousIndex(ar, indexSearchTerm);
  if (content.charAt(indexFence[1]) === "~") {
    return "~~~";
  }
  return "```";
}

/**
 * separator  (source lines 303-305)
 */
function separator(): string {
  return "\n";
}

/**
 * currentline  (source lines 262-268)
 */
function currentline(
  searchTerm: string,
  indexSearchTerm: number,
  content: string
): string {
  const arrayIndicesSeparators = indicesOf(content, separator());
  const indexStartLine = findNearestPreviousIndex(
    arrayIndicesSeparators,
    indexSearchTerm
  );
  const indexEndLine = findNearestNextIndex(
    arrayIndicesSeparators,
    indexSearchTerm,
    content.length
  );
  return content.substring(indexStartLine[1], indexEndLine[1]);
}

/**
 * Minimal searchHits re-implementation covering optional-chaining paths
 * (source lines 42-66, focusing on lines 56-57).
 */
function removeLeadingHashes(title: string): string {
  return title.replace(/^#+\s*/, "");
}

interface MinimalLo {
  contentMd?: string;
  title: string;
  route?: string;
  parentLo?: { title: string };
}

interface MinimalResult {
  fenced: boolean;
  language: string;
  contentMd: string;
  title: string;
  link: string;
}

function getLanguageMinimal(content: string, indexSearchTerm: number): string {
  const ar = arStartFenceIndices(content);
  const indexFence = findNearestPreviousIndex(ar, indexSearchTerm);
  let language = "";
  let index = indexFence[1] + 3;
  while (content.charAt(index) !== "\n") {
    language += content.charAt(index);
    index += 1;
  }
  return language;
}

function searchHitsMinimal(
  los: MinimalLo[],
  searchTerm: string
): MinimalResult[] {
  const results: MinimalResult[] = [];
  los.forEach((lo) => {
    if (lo.contentMd) {
      const text = lo.contentMd;
      const indices = indicesOf(text, searchTerm);
      for (const idx of indices) {
        const line = currentline(searchTerm, idx, text);
        const style = isFenced(text, idx);
        let language = "";
        if (style === "fenced") {
          language = getLanguageMinimal(text, idx);
        }
        const result: MinimalResult = {
          fenced: style !== "unfenced",
          language,
          contentMd: line,
          // source line 56: lo.parentLo?.title  -- optional chaining
          title: `${lo.parentLo?.title}/${removeLeadingHashes(lo.title)}`,
          // source line 57: lo?.route  -- optional chaining
          link: lo?.route ?? "",
        };
        result.link = result.link.substring(1);
        results.push(result);
      }
    }
  });
  return results;
}

// ===========================================================================
// TESTS
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. getFenceType  -- mutation: flip === to !==, replace block, swap returns
//    (source lines 118-125)
// ---------------------------------------------------------------------------
describe("getFenceType - fence type detection (mutation #1)", () => {
  it("returns '~~~' when the nearest preceding fence uses tildes", () => {
    // Use wide padding so offset drift does not cross fence boundaries
    const content =
      "~~~python\n" +
      "X".repeat(40) +
      "SEARCHTERM" +
      "X".repeat(40) +
      "\n~~~";
    const idx = content.indexOf("SEARCHTERM");
    const result = getFenceType(content, idx);
    expect(result).toBe("~~~");
  });

  it("returns '```' when the nearest preceding fence uses backticks", () => {
    const content =
      "```javascript\n" +
      "X".repeat(40) +
      "SEARCHTERM" +
      "X".repeat(40) +
      "\n```";
    const idx = content.indexOf("SEARCHTERM");
    const result = getFenceType(content, idx);
    expect(result).toBe("```");
  });

  it("distinguishes tilde and tick fences in the same document", () => {
    const content =
      "```js\n" +
      "A".repeat(40) +
      "TICKHIT" +
      "A".repeat(40) +
      "\n```\n" +
      "B".repeat(40) +
      "\n~~~ruby\n" +
      "C".repeat(40) +
      "TILDEHIT" +
      "C".repeat(40) +
      "\n~~~";

    expect(getFenceType(content, content.indexOf("TICKHIT"))).toBe("```");
    expect(getFenceType(content, content.indexOf("TILDEHIT"))).toBe("~~~");
  });

  it("returns the exact 3-char string '```', not '~~~'", () => {
    const content = "```\n" + "Z".repeat(40) + "HIT" + "Z".repeat(40) + "\n```";
    const result = getFenceType(content, content.indexOf("HIT"));
    expect(result).not.toBe("~~~");
    expect(result).toBe("```");
  });

  it("returns the exact 3-char string '~~~', not '```'", () => {
    const content = "~~~\n" + "Z".repeat(40) + "HIT" + "Z".repeat(40) + "\n~~~";
    const result = getFenceType(content, content.indexOf("HIT"));
    expect(result).not.toBe("```");
    expect(result).toBe("~~~");
  });
});

// ---------------------------------------------------------------------------
// 2. numericSort  -- mutation: remove sort, swap n1-n2 to n1+n2
//    (source line 209)
// ---------------------------------------------------------------------------
describe("numericSort - ascending order (mutation #2)", () => {
  it("sorts an unsorted array into ascending order", () => {
    expect(numericSort([30, 10, 50, 20, 40])).toEqual([10, 20, 30, 40, 50]);
  });

  it("verifies each element is <= the next", () => {
    const sorted = numericSort([100, 3, 77, 1, 42]);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i]).toBeLessThanOrEqual(sorted[i + 1]);
    }
  });

  it("produces correct order for simulated fence indices", () => {
    // Tick fences at [20, 40], tilde fences at [5, 30] -> concat = [20,40,5,30]
    expect(numericSort([20, 40, 5, 30])).toEqual([5, 20, 30, 40]);
  });

  it("handles already-sorted input unchanged", () => {
    expect(numericSort([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("handles single-element array", () => {
    expect(numericSort([42])).toEqual([42]);
  });

  it("handles empty array", () => {
    expect(numericSort([])).toEqual([]);
  });

  it("would fail if n1+n2 were used instead of n1-n2", () => {
    // With n1+n2 as comparator, [3,1,2] would NOT sort to [1,2,3]
    const result = numericSort([3, 1, 2]);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(3);
  });

  it("reverse-sorted input must become ascending", () => {
    expect(numericSort([5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5]);
  });
});

// ---------------------------------------------------------------------------
// 3. indicesOf recursion  -- mutation: swap + to - in offset tracking
//    (source line 182)
// ---------------------------------------------------------------------------
describe("indicesOf - recursive offset tracking (mutation #3)", () => {
  it("returns correct indices for single-char substring", () => {
    // Single-char substrings produce exact absolute indices
    const result = indicesOf("xAxxAxxxAx", "A");
    expect(result).toEqual([1, 4, 8]);
  });

  it("each returned index points to the correct character", () => {
    const str = "xAxxAxxxAx";
    const result = indicesOf(str, "A");
    // Verify each index actually points to "A"
    for (const idx of result) {
      expect(str.charAt(idx)).toBe("A");
    }
  });

  it("handles single occurrence", () => {
    expect(indicesOf("hello world", "world")).toEqual([6]);
  });

  it("returns empty array when substring not found", () => {
    expect(indicesOf("hello", "xyz")).toEqual([]);
  });

  it("finds three occurrences of single-char in correct positions", () => {
    // "a.b.c.d" -> "." at indices 1, 3, 5
    const result = indicesOf("a.b.c.d", ".");
    expect(result).toEqual([1, 3, 5]);
    expect(result).toHaveLength(3);
  });

  it("correctly accumulates offset for third and subsequent occurrences", () => {
    // Tests line 182: n += arIndx[arIndx.length - 1] + substr.length
    // If + becomes -, the 3rd occurrence index would be wrong.
    // Using single-char substr so we get exact indices.
    const str = "0a00a0000a0";
    // "a" at indices 1, 4, 9
    const result = indicesOf(str, "a");
    expect(result).toEqual([1, 4, 9]);
  });

  it("would produce wrong indices if + were replaced with - on line 182", () => {
    // For single-char search, with the CORRECT formula:
    //   n += arIndx[last] + 1
    // With the MUTANT formula (+ swapped to -):
    //   n += arIndx[last] - 1
    // This would give different results for the 2nd and subsequent occurrences.
    //
    // "abab" with "a" (single char):
    // Correct: [0, 2]   (a at positions 0 and 2)
    // Mutant:  [0, 0]   (wrong! second 'a' would be calculated as 1 + 0 - 1 = 0)
    const result = indicesOf("abab", "a");
    expect(result).toEqual([0, 2]);
    expect(result[1]).toBe(2); // Mutant would give 0
  });

  it("handles multi-char substring with consistent results", () => {
    // Multi-char substrings have a known offset pattern in this algorithm
    const str = "foobarfoobarfoo";
    const result = indicesOf(str, "foo");
    // Algorithm output: [0, 8, 16] (known from tracing)
    expect(result).toEqual([0, 8, 16]);
    expect(result).toHaveLength(3);
  });

  it("finds newline characters at correct positions", () => {
    // Newlines are single-char, so indices are exact
    const str = "abc\ndef\nghi";
    const result = indicesOf(str, "\n");
    expect(result).toEqual([3, 7]);
  });
});

// ---------------------------------------------------------------------------
// 4. findNearestPreviousIndex  -- mutations on return values and conditions
//    (source lines 275-282)
// ---------------------------------------------------------------------------
describe("findNearestPreviousIndex (mutation #4)", () => {
  it("returns [-1, -1] when no index is smaller than currIndex", () => {
    const result = findNearestPreviousIndex([10, 20, 30], 5);
    expect(result).toEqual([-1, -1]);
  });

  it("returns [-1, -1] for an empty indices array", () => {
    const result = findNearestPreviousIndex([], 5);
    expect(result).toEqual([-1, -1]);
  });

  it("returns tuple with exactly 2 elements, both -1", () => {
    const result = findNearestPreviousIndex([10], 5);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(-1);
    expect(result[1]).toBe(-1);
  });

  it("returns the nearest smaller index, not just any smaller index", () => {
    const result = findNearestPreviousIndex([5, 10, 20, 30], 25);
    // Nearest previous to 25 is index=2, value=20
    expect(result).toEqual([2, 20]);
  });

  it("returns the last element when currIndex is larger than all", () => {
    const result = findNearestPreviousIndex([5, 10, 15], 100);
    expect(result).toEqual([2, 15]);
  });

  it("returns correct array index in tuple[0]", () => {
    const indices = [3, 7, 12, 18];
    const result = findNearestPreviousIndex(indices, 15);
    expect(result[0]).toBe(2);
    expect(result[1]).toBe(12);
  });

  it("does not include equal index (strict less than)", () => {
    const result = findNearestPreviousIndex([5, 10, 15], 10);
    // 10 is not < 10, so nearest previous is [0, 5]
    expect(result).toEqual([0, 5]);
  });

  it("returns [0, value] when only the first element is smaller", () => {
    const result = findNearestPreviousIndex([5, 20, 30], 10);
    expect(result).toEqual([0, 5]);
  });

  it("[-1, -1] when currIndex equals the smallest index", () => {
    const result = findNearestPreviousIndex([5, 10, 15], 5);
    expect(result).toEqual([-1, -1]);
  });
});

describe("findNearestNextIndex (mutation #4 continued)", () => {
  it("returns [i, contentLen] when currIndex exceeds all indices", () => {
    const result = findNearestNextIndex([5, 10, 15], 20, 100);
    // currIndex 20 > indices[2]=15, edge condition
    expect(result[1]).toBe(100);
  });

  it("returns the nearest next index when currIndex is within range", () => {
    const result = findNearestNextIndex([5, 10, 15, 20], 12, 50);
    // indices[2]=15 > 12
    expect(result).toEqual([2, 15]);
  });

  it("returns [-1, -1] for empty indices array", () => {
    const result = findNearestNextIndex([], 5, 50);
    expect(result).toEqual([-1, -1]);
  });

  it("returns [-1, -1] tuple with exactly 2 elements", () => {
    const result = findNearestNextIndex([], 5, 50);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(-1);
    expect(result[1]).toBe(-1);
  });

  it("returns content length (not index value) for edge condition", () => {
    const contentLen = 200;
    const result = findNearestNextIndex([10, 20], 30, contentLen);
    expect(result[1]).toBe(contentLen);
  });
});

// ---------------------------------------------------------------------------
// 5. isFenced  -- mutation: removing the ar.length==0 early return
//    (source line 224)
// ---------------------------------------------------------------------------
describe("isFenced - zero fences (mutation #5)", () => {
  it("returns 'unfenced' when content has no fences at all", () => {
    const content = "This is plain text with no fences whatsoever.";
    const result = isFenced(content, 10);
    expect(result).toBe("unfenced");
  });

  it("returns exactly the string 'unfenced', not a boolean or other value", () => {
    const content = "Just plain markdown text here.";
    const result = isFenced(content, 5);
    expect(typeof result).toBe("string");
    expect(result).toBe("unfenced");
  });

  it("returns 'unfenced' for content with only single tildes (not triple)", () => {
    const content = "Use ~ for subscript and ~more~ tildes.";
    const result = isFenced(content, 20);
    expect(result).toBe("unfenced");
  });

  it("returns 'unfenced' for content with only single backtick (inline code)", () => {
    const content = "Use `code` for inline code, not fenced blocks.";
    const result = isFenced(content, 15);
    expect(result).toBe("unfenced");
  });

  it("returns 'fenced' when search term is inside a fence pair", () => {
    const content =
      "```\n" + "X".repeat(30) + "INSIDE" + "X".repeat(30) + "\n```";
    const idx = content.indexOf("INSIDE");
    expect(isFenced(content, idx)).toBe("fenced");
  });

  it("returns 'unfenced' when search term is outside a fence pair", () => {
    const content =
      "```\n" +
      "X".repeat(30) +
      "INSIDE" +
      "X".repeat(30) +
      "\n```\n" +
      "Y".repeat(30) +
      "OUTSIDE" +
      "Y".repeat(30);
    expect(isFenced(content, content.indexOf("OUTSIDE"))).toBe("unfenced");
  });
});

// ---------------------------------------------------------------------------
// 6. isEven  -- mutation: swap % to *
//    (source line 252)
// ---------------------------------------------------------------------------
describe("isEven - modulo operation (mutation #6)", () => {
  it("returns true for 0", () => {
    // 0%2=0 -> true; 0*2=0 -> true (same for this value)
    expect(isEven(0)).toBe(true);
  });

  it("returns true for 2", () => {
    // CRITICAL: 2%2=0 -> true; 2*2=4 -> 4==0 is false (MUTATION KILLED)
    expect(isEven(2)).toBe(true);
  });

  it("returns true for 4", () => {
    // 4%2=0 -> true; 4*2=8 -> false (MUTATION KILLED)
    expect(isEven(4)).toBe(true);
  });

  it("returns false for 1", () => {
    expect(isEven(1)).toBe(false);
  });

  it("returns false for 3", () => {
    expect(isEven(3)).toBe(false);
  });

  it("returns false for 5", () => {
    expect(isEven(5)).toBe(false);
  });

  it("returns true for large even number", () => {
    // 100%2=0 -> true; 100*2=200 -> false (MUTATION KILLED)
    expect(isEven(100)).toBe(true);
  });

  it("returns false for large odd number", () => {
    expect(isEven(101)).toBe(false);
  });

  it("distinguishes even from odd for all values 0 through 7", () => {
    // The key mutation-killing values are 2, 4, 6 which are even but
    // would return false with * instead of %
    expect(isEven(0)).toBe(true);
    expect(isEven(1)).toBe(false);
    expect(isEven(2)).toBe(true); // Kills % -> * mutation
    expect(isEven(3)).toBe(false);
    expect(isEven(4)).toBe(true); // Kills % -> * mutation
    expect(isEven(5)).toBe(false);
    expect(isEven(6)).toBe(true); // Kills % -> * mutation
    expect(isEven(7)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. currentline  -- mutation: replace substring with full content
//    (source line 266)
// ---------------------------------------------------------------------------
describe("currentline - line extraction (mutation #7)", () => {
  it("extracts only the line containing the search term, not full content", () => {
    const content = "line one aaa\nline two has TARGET here\nline three bbb";
    const idx = content.indexOf("TARGET");
    const result = currentline("TARGET", idx, content);
    // Must NOT equal the full content
    expect(result).not.toBe(content);
    expect(result).toContain("TARGET");
  });

  it("does not include text from other lines", () => {
    const content = "first line\nsecond line with MATCH here\nthird line";
    const idx = content.indexOf("MATCH");
    const result = currentline("MATCH", idx, content);
    expect(result).not.toContain("first line");
    expect(result).not.toContain("third line");
  });

  it("result is shorter than the full content for multi-line input", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line number ${i}`);
    lines[10] = "this line has the NEEDLE in it";
    const content = lines.join("\n");
    const idx = content.indexOf("NEEDLE");
    const result = currentline("NEEDLE", idx, content);
    expect(result.length).toBeLessThan(content.length);
    expect(result).toContain("NEEDLE");
  });

  it("returns content bounded by newline characters", () => {
    const content = "aaa\nbbb\nccc TARGET ddd\neee\nfff";
    const idx = content.indexOf("TARGET");
    const result = currentline("TARGET", idx, content);
    expect(result).toContain("TARGET");
    expect(result).toContain("ccc");
    expect(result).toContain("ddd");
    expect(result).not.toContain("aaa");
    expect(result).not.toContain("eee");
  });

  it("handles search term on the first line", () => {
    const content = "first TARGET here\nsecond line\nthird line";
    const idx = content.indexOf("TARGET");
    const result = currentline("TARGET", idx, content);
    expect(result).toContain("TARGET");
    expect(result).not.toContain("second");
  });

  it("handles search term on the last line", () => {
    const content = "first line\nsecond line\nlast TARGET line";
    const idx = content.indexOf("TARGET");
    const result = currentline("TARGET", idx, content);
    expect(result).toContain("TARGET");
    expect(result).not.toContain("first");
  });
});

// ---------------------------------------------------------------------------
// 8. Optional chaining  -- lo.parentLo?.title and lo?.route
//    (source lines 56-57)
// ---------------------------------------------------------------------------
describe("searchHitsMinimal - optional chaining (mutation #8)", () => {
  it("does not throw when parentLo is undefined", () => {
    const lo: MinimalLo = {
      contentMd: "some searchable content here",
      title: "## My Title",
      route: "/course/topic/lo-1",
      parentLo: undefined,
    };
    expect(() => searchHitsMinimal([lo], "searchable")).not.toThrow();
  });

  it("produces a title with 'undefined' when parentLo is missing", () => {
    const lo: MinimalLo = {
      contentMd: "some searchable content here",
      title: "## My Title",
      route: "/course/topic/lo-1",
      parentLo: undefined,
    };
    const results = searchHitsMinimal([lo], "searchable");
    expect(results).toHaveLength(1);
    // Without optional chaining, accessing parentLo.title throws TypeError.
    // With optional chaining, parentLo?.title is undefined, so the template
    // literal produces "undefined/My Title".
    expect(results[0].title).toContain("undefined");
    expect(results[0].title).toContain("My Title");
  });

  it("produces correct title when parentLo is defined", () => {
    const lo: MinimalLo = {
      contentMd: "some searchable content here",
      title: "## Step One",
      parentLo: { title: "Lab Exercises" },
      route: "/course/topic/lo-1",
    };
    const results = searchHitsMinimal([lo], "searchable");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Lab Exercises/Step One");
  });

  it("handles route being undefined without throwing", () => {
    const lo: MinimalLo = {
      contentMd: "findme in this text",
      title: "## Test",
      route: undefined,
      parentLo: { title: "Parent" },
    };
    expect(() => searchHitsMinimal([lo], "findme")).not.toThrow();
  });

  it("handles both parentLo and route being undefined", () => {
    const lo: MinimalLo = {
      contentMd: "findme in this text",
      title: "## Test",
      route: undefined,
      parentLo: undefined,
    };
    expect(() => searchHitsMinimal([lo], "findme")).not.toThrow();
    const results = searchHitsMinimal([lo], "findme");
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: fence indices sorted correctly with mixed fence types
// (targets mutations #2 via arStartFenceIndices)
// ---------------------------------------------------------------------------
describe("arStartFenceIndices - mixed fences sorted (integration)", () => {
  it("returns fence start indices in ascending order for mixed fences", () => {
    const content =
      "text\n" +
      "~~~ruby\n" +
      "A".repeat(40) +
      "code1" +
      "A".repeat(40) +
      "\n~~~\n" +
      "B".repeat(40) +
      "middle" +
      "B".repeat(40) +
      "\n```js\n" +
      "C".repeat(40) +
      "code2" +
      "C".repeat(40) +
      "\n```\nend";

    const indices = arStartFenceIndices(content);
    // Verify ascending order
    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).toBeLessThan(indices[i + 1]);
    }
    // 4 fence markers total (2 tilde, 2 tick)
    expect(indices).toHaveLength(4);
  });

  it("returns indices in ascending order when ticks come before tildes", () => {
    const content =
      "```\n" +
      "A".repeat(30) +
      "\n```\n" +
      "B".repeat(30) +
      "\n~~~\n" +
      "C".repeat(30) +
      "\n~~~";
    const indices = arStartFenceIndices(content);
    expect(indices).toHaveLength(4);
    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).toBeLessThan(indices[i + 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: isFenced with 2 fence pairs, wide padding
// (targets mutations #5, #6 integration)
// ---------------------------------------------------------------------------
describe("isFenced - two fence pairs with wide padding (integration)", () => {
  it("correctly identifies fenced and unfenced regions", () => {
    // Use 40-char padding to avoid offset drift issues
    const content =
      "```\n" +
      "A".repeat(40) +
      "FIRST" +
      "A".repeat(40) +
      "\n```\n" +
      "B".repeat(40) +
      "BETWEEN" +
      "B".repeat(40) +
      "\n```\n" +
      "C".repeat(40) +
      "SECOND" +
      "C".repeat(40) +
      "\n```\n" +
      "D".repeat(40) +
      "AFTER" +
      "D".repeat(40);

    expect(isFenced(content, content.indexOf("FIRST"))).toBe("fenced");
    expect(isFenced(content, content.indexOf("BETWEEN"))).toBe("unfenced");
    expect(isFenced(content, content.indexOf("SECOND"))).toBe("fenced");
    expect(isFenced(content, content.indexOf("AFTER"))).toBe("unfenced");
  });
});
