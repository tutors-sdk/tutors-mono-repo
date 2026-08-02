import { describe, it, expect } from "vitest";
import {
  generateLink,
  generateImg,
  wallLink,
  tocLink,
  generateRefLink,
  generateVideoLink,
  generateCrumbLink,
} from "../../../packages/jsr/gen/src/templates/utils";
import type { Lo } from "@tutors/tutors-model-lib";

// ---------------------------------------------------------------------------
// Mock-Lo factory
// ---------------------------------------------------------------------------

/**
 * Build a minimal Lo mock.
 *
 * Routes in the gen system are typically bare paths such as
 * `/lab/course-id/topic-1/lab-1` (no protocol).  Where tests exercise
 * the protocol-stripping branch they supply explicit protocol URLs.
 */
function makeLo(overrides: Partial<Lo> & { archiveFile?: string } = {}): Lo {
  return {
    type: "note",
    id: "lo-1",
    title: "Test LO",
    summary: "",
    contentMd: "",
    frontMatter: {} as any,
    route: "/note/course-id/topic-1/lo-1",
    authLevel: 0,
    img: "/note/course-id/topic-1/lo-1/img.png",
    imgFile: "img.png",
    video: "",
    videoids: { videoid: "", videoIds: [] },
    hide: false,
    ...overrides,
  } as Lo;
}

function makeCourseLo(): Lo {
  return makeLo({
    type: "course",
    id: "course",
    route: "/",
  });
}

function makeParentUnit(): Lo {
  return makeLo({
    type: "unit",
    id: "unit-1",
    route: "/unit/course-id/topic-1/unit-1",
  });
}

function makeParentSide(): Lo {
  return makeLo({
    type: "side",
    id: "side-1",
    route: "/side/course-id/topic-1/side-1",
  });
}

// ===========================================================================
// generateLink
// ===========================================================================
describe("generateLink", () => {
  // --- Web / GitHub bypass ---
  it("returns the raw route for a web type", () => {
    const lo = makeLo({ type: "web", route: "https://example.com" });
    expect(generateLink(lo)).toBe("https://example.com");
  });

  it("returns the raw route for a github type", () => {
    const lo = makeLo({ type: "github", route: "https://github.com/org/repo" });
    expect(generateLink(lo)).toBe("https://github.com/org/repo");
  });

  it("returns the raw route for web even when isAbsolute is true", () => {
    const lo = makeLo({ type: "web", route: "https://example.com" });
    expect(generateLink(lo, true)).toBe("https://example.com");
  });

  it("returns the raw route for github even when isAbsolute is true", () => {
    const lo = makeLo({ type: "github", route: "https://github.com/org/repo" });
    expect(generateLink(lo, true)).toBe("https://github.com/org/repo");
  });

  // --- Relative links (default) ---
  it("produces a relative link with ./id/index.html for a note without a unit parent", () => {
    const lo = makeLo({ type: "note", id: "my-note" });
    expect(generateLink(lo)).toBe("./my-note/index.html");
  });

  it("prefixes with parentLo id when parent is a unit", () => {
    const parent = makeParentUnit();
    const lo = makeLo({ type: "talk", id: "talk-1", parentLo: parent });
    expect(generateLink(lo)).toBe("./unit-1/talk-1/index.html");
  });

  it("prefixes with parentLo id when parent is a side", () => {
    const parent = makeParentSide();
    const lo = makeLo({ type: "lab", id: "lab-1", parentLo: parent });
    expect(generateLink(lo)).toBe("./side-1/lab-1/index.html");
  });

  it("uses ./ prefix when parent is a topic (not unit/side)", () => {
    const parent = makeLo({ type: "topic", id: "topic-1" });
    const lo = makeLo({ type: "lab", id: "lab-1", parentLo: parent });
    expect(generateLink(lo)).toBe("./lab-1/index.html");
  });

  it("returns id/archiveFile for an archive in relative mode", () => {
    const lo = makeLo({ type: "archive", id: "archive-1" }) as any;
    lo.archiveFile = "project.zip";
    expect(generateLink(lo)).toBe("archive-1/project.zip");
  });

  it("returns id/ (empty archiveFile) for an archive without archiveFile", () => {
    const lo = makeLo({ type: "archive", id: "archive-1" });
    expect(generateLink(lo)).toBe("archive-1/");
  });

  // --- Absolute links ---
  it("returns index.html for a talk whose parent is a course (absolute)", () => {
    const parent = makeCourseLo();
    const lo = makeLo({ type: "talk", id: "talk-1", parentLo: parent });
    expect(generateLink(lo, true)).toBe("index.html");
  });

  it("returns index.html for a lab whose parent is a course (absolute)", () => {
    const parent = makeCourseLo();
    const lo = makeLo({ type: "lab", id: "lab-1", parentLo: parent });
    expect(generateLink(lo, true)).toBe("index.html");
  });

  it("returns route (unchanged, no protocol) + /index.html for a lab with non-course parent (absolute)", () => {
    // Routes without // are returned unchanged by stripProtocol
    const parent = makeLo({ type: "topic", id: "topic-1" });
    const lo = makeLo({
      type: "lab",
      id: "lab-1",
      route: "/lab/course-id/topic-1/lab-1",
      parentLo: parent,
    });
    expect(generateLink(lo, true)).toBe("/lab/course-id/topic-1/lab-1/index.html");
  });

  it("strips protocol and returns path/index.html for a lab with protocol route (absolute)", () => {
    // When route has //, stripProtocol strips up to //
    const parent = makeLo({ type: "topic", id: "topic-1" });
    const lo = makeLo({
      type: "lab",
      id: "lab-1",
      route: "https://tutors.dev/lab/course-id/topic-1/lab-1",
      parentLo: parent,
    });
    // stripProtocol("https://tutors.dev/...") => "tutors.dev/lab/course-id/topic-1/lab-1"
    expect(generateLink(lo, true)).toBe("tutors.dev/lab/course-id/topic-1/lab-1/index.html");
  });

  it("returns route unchanged for an archive without protocol in absolute mode", () => {
    const lo = makeLo({
      type: "archive",
      route: "/archive/course-id/archive-1",
    });
    // No //, so stripProtocol returns unchanged
    expect(generateLink(lo, true)).toBe("/archive/course-id/archive-1");
  });

  it("falls through to lo.route for an unknown type in absolute mode", () => {
    const lo = makeLo({
      type: "podcast" as any,
      route: "/course/podcast-1",
    });
    expect(generateLink(lo, true)).toBe("/course/podcast-1");
  });
});

// ===========================================================================
// generateImg
// ===========================================================================
describe("generateImg", () => {
  it("returns img unchanged when no protocol present (absolute mode)", () => {
    const lo = makeLo({ img: "/course-id/topic-1/lo-1/img.png" });
    expect(generateImg(lo, true)).toBe("/course-id/topic-1/lo-1/img.png");
  });

  it("strips protocol from img in absolute mode", () => {
    const lo = makeLo({ img: "https://tutors.dev/course/img.png" });
    // stripProtocol strips to "tutors.dev/course/img.png"
    expect(generateImg(lo, true)).toBe("tutors.dev/course/img.png");
  });

  it("returns relative path without unit parent", () => {
    const lo = makeLo({ id: "lo-1", imgFile: "card.png" });
    expect(generateImg(lo)).toBe("./lo-1/card.png");
  });

  it("prefixes with unit parent id in relative mode", () => {
    const parent = makeParentUnit();
    const lo = makeLo({ id: "lo-1", imgFile: "card.png", parentLo: parent });
    expect(generateImg(lo)).toBe("./unit-1/lo-1/card.png");
  });

  it("prefixes with side parent id in relative mode", () => {
    const parent = makeParentSide();
    const lo = makeLo({ id: "lo-1", imgFile: "card.png", parentLo: parent });
    expect(generateImg(lo)).toBe("./side-1/lo-1/card.png");
  });

  it("uses ./ for a topic parent in relative mode", () => {
    const parent = makeLo({ type: "topic", id: "topic-1" });
    const lo = makeLo({ id: "lo-1", imgFile: "card.png", parentLo: parent });
    expect(generateImg(lo)).toBe("./lo-1/card.png");
  });
});

// ===========================================================================
// wallLink
// ===========================================================================
describe("wallLink", () => {
  it("returns ./ when route has no double-slash", () => {
    const lo = makeLo({ route: "/course/topic-1" });
    expect(wallLink(lo)).toBe("./");
  });

  it("returns ./ when route is a bare slash", () => {
    const lo = makeLo({ route: "/" });
    expect(wallLink(lo)).toBe("./");
  });

  it("computes depth from path after // in an https URL", () => {
    // "https://tutors.dev/course/topic-1"
    // pathPart after first //: "tutors.dev/course/topic-1"
    // slashes in pathPart: 2, depth = 3
    const lo = makeLo({ route: "https://tutors.dev/course/topic-1" });
    expect(wallLink(lo)).toBe("../../../");
  });

  it("returns ../ for a single-segment path after //", () => {
    // "https://tutors.dev" => pathPart "tutors.dev" => 0 slashes => depth 1
    const lo = makeLo({ route: "https://tutors.dev" });
    expect(wallLink(lo)).toBe("../");
  });

  it("returns ./ for empty route", () => {
    const lo = makeLo({ route: "" });
    expect(wallLink(lo)).toBe("./");
  });
});

// ===========================================================================
// tocLink
// ===========================================================================
describe("tocLink", () => {
  it("uses ./ prefix when fromlo route has no //", () => {
    const fromlo = makeLo({ route: "/topic/course-id/topic-1" });
    const targetParent = makeCourseLo();
    const target = makeLo({
      type: "talk",
      id: "talk-1",
      route: "/talk/course-id/talk-1",
      parentLo: targetParent,
    });
    // fromlo has no // => depth 0 => "./"
    // generateLink(target, true) with course parent => "index.html"
    expect(tocLink(fromlo, target)).toBe("./index.html");
  });

  it("combines depth with generateLink for protocol routes", () => {
    // fromlo: "https://host/a/b" => pathPart "host/a/b" => 2 slashes => depth 3
    const fromlo = makeLo({ route: "https://host/a/b" });
    const targetParent = makeCourseLo();
    const target = makeLo({
      type: "talk",
      id: "talk-1",
      parentLo: targetParent,
    });
    // generateLink(target, true) with course parent => "index.html"
    expect(tocLink(fromlo, target)).toBe("../../../index.html");
  });

  it("appends absolute link for non-course parent target", () => {
    const fromlo = makeLo({ route: "/local" });
    const target = makeLo({
      type: "note",
      id: "note-1",
      route: "/note/course-id/note-1",
      parentLo: makeLo({ type: "topic" }),
    });
    // fromlo depth 0 => "./"
    // generateLink(target, true) => route has no //, stripProtocol unchanged =>
    //   "/note/course-id/note-1/index.html"
    expect(tocLink(fromlo, target)).toBe(".//note/course-id/note-1/index.html");
  });
});

// ===========================================================================
// generateRefLink
// ===========================================================================
describe("generateRefLink", () => {
  it("returns ../../index.html for a panelvideo", () => {
    const lo = makeLo({ type: "panelvideo" as any });
    expect(generateRefLink(lo, "/some/path")).toBe("../../index.html");
  });

  it("returns the raw route for a web type", () => {
    const lo = makeLo({ type: "web", route: "https://example.com" });
    expect(generateRefLink(lo, "/path")).toBe("https://example.com");
  });

  it("returns the raw route for a github type", () => {
    const lo = makeLo({ type: "github", route: "https://github.com/org/repo" });
    expect(generateRefLink(lo, "/path")).toBe("https://github.com/org/repo");
  });

  it("returns path/id/archiveFile for an archive", () => {
    const lo = makeLo({ type: "archive", id: "arch-1" }) as any;
    lo.archiveFile = "bundle.zip";
    expect(generateRefLink(lo, "/base")).toBe("/base/arch-1/bundle.zip");
  });

  it("returns path/id/ when archiveFile is missing on archive", () => {
    const lo = makeLo({ type: "archive", id: "arch-1" });
    expect(generateRefLink(lo, "/base")).toBe("/base/arch-1/");
  });

  it("returns path + id/index.html for other types", () => {
    const lo = makeLo({ type: "note", id: "note-1" });
    expect(generateRefLink(lo, "/base/")).toBe("/base/note-1/index.html");
  });

  it("concatenates path directly with id (no extra slash) when path has no trailing slash", () => {
    const lo = makeLo({ type: "lab", id: "lab-1" });
    expect(generateRefLink(lo, "")).toBe("lab-1/index.html");
  });
});

// ===========================================================================
// generateVideoLink
// ===========================================================================
describe("generateVideoLink", () => {
  it("returns empty string when videoids.videoid is empty", () => {
    const lo = makeLo({ videoids: { videoid: "", videoIds: [] } });
    expect(generateVideoLink(lo)).toBe("");
  });

  it("returns a basic YouTube watch URL when no time params exist", () => {
    const lo = makeLo({
      videoids: { videoid: "abc123", videoIds: [] },
      video: "",
    });
    expect(generateVideoLink(lo)).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("converts start= parameter to t= with seconds suffix", () => {
    const lo = makeLo({
      videoids: { videoid: "abc123", videoIds: [] },
      video: "https://www.youtube.com/embed/abc123?start=120",
    });
    expect(generateVideoLink(lo)).toBe("https://www.youtube.com/watch?v=abc123&t=120s");
  });

  it("preserves existing t= parameter from the video field", () => {
    const lo = makeLo({
      videoids: { videoid: "abc123", videoIds: [] },
      video: "https://www.youtube.com/embed/abc123?t=2m30s",
    });
    expect(generateVideoLink(lo)).toBe("https://www.youtube.com/watch?v=abc123&t=2m30s");
  });

  it("prefers start= over t= when both are present", () => {
    const lo = makeLo({
      videoids: { videoid: "abc123", videoIds: [] },
      video: "https://www.youtube.com/embed/abc123?start=60&t=2m",
    });
    // start match comes first in the code
    expect(generateVideoLink(lo)).toBe("https://www.youtube.com/watch?v=abc123&t=60s");
  });

  it("returns empty string when videoids is undefined", () => {
    const lo = makeLo();
    (lo as any).videoids = undefined;
    expect(generateVideoLink(lo)).toBe("");
  });

  it("returns base URL when video field has no time params", () => {
    const lo = makeLo({
      videoids: { videoid: "xyz789", videoIds: [] },
      video: "https://www.youtube.com/embed/xyz789",
    });
    expect(generateVideoLink(lo)).toBe("https://www.youtube.com/watch?v=xyz789");
  });
});

// ===========================================================================
// generateCrumbLink
// ===========================================================================
describe("generateCrumbLink", () => {
  it("adds one extra ../ when parent is a course (index 0)", () => {
    const parent = makeCourseLo();
    const lo = makeLo({ parentLo: parent });
    // index 0 => incremented to 1 => "../index.html"
    expect(generateCrumbLink(0, lo)).toBe("../index.html");
  });

  it("returns ../../index.html for index 1 with course parent", () => {
    const parent = makeCourseLo();
    const lo = makeLo({ parentLo: parent });
    expect(generateCrumbLink(1, lo)).toBe("../../index.html");
  });

  it("returns ../../../index.html for index 2 with course parent", () => {
    const parent = makeCourseLo();
    const lo = makeLo({ parentLo: parent });
    expect(generateCrumbLink(2, lo)).toBe("../../../index.html");
  });

  it("returns ../../index.html for a unit type (regardless of index)", () => {
    const lo = makeLo({ type: "unit" });
    expect(generateCrumbLink(0, lo)).toBe("../../index.html");
    expect(generateCrumbLink(3, lo)).toBe("../../index.html");
  });

  it("returns ../../index.html for a side type", () => {
    const lo = makeLo({ type: "side" });
    expect(generateCrumbLink(0, lo)).toBe("../../index.html");
  });

  it("repeats ../ by index for a standard type without course parent", () => {
    const lo = makeLo({ type: "note" });
    expect(generateCrumbLink(0, lo)).toBe("index.html");
    expect(generateCrumbLink(1, lo)).toBe("../index.html");
    expect(generateCrumbLink(2, lo)).toBe("../../index.html");
  });
});
