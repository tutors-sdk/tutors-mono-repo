import { describe, it, expect } from "vitest";
import {
  fixRoutePaths,
  injectCourseUrl,
  removeLeadingHashes,
  getUnits,
  sortLos,
  crumbs,
  getVideoConfig,
} from "../../../packages/jsr/model/src/utils/lo-utils";

// ---------------------------------------------------------------------------
// Helper: build a minimal Lo-compatible object
// ---------------------------------------------------------------------------
function makeLo(overrides: Record<string, unknown> = {}): any {
  return {
    type: "note",
    id: "lo-1",
    title: "Test",
    summary: "",
    contentMd: "",
    route: "/course/topic/lo-1",
    authLevel: 0,
    img: "",
    video: "",
    hide: false,
    frontMatter: {},
    ...overrides,
  };
}

// ===========================================================================
// 1. fixRoutePaths — kill conditional/logical mutations
// ===========================================================================
describe("fixRoutePaths — mutation killing", () => {
  it("does NOT modify video when video does not start with '#'", () => {
    const lo = makeLo({ route: "/ok", video: "/already/good" });
    fixRoutePaths(lo);
    // If `lo.video && lo.video[0] === "#"` mutates to `lo.video || ...`
    // or `lo.video[0] === "#"` mutates to `true`, the video would be wrongly
    // changed. This asserts it stays untouched.
    expect(lo.video).toBe("/already/good");
  });

  it("does NOT modify video when video is empty string", () => {
    const lo = makeLo({ route: "/ok", video: "" });
    fixRoutePaths(lo);
    expect(lo.video).toBe("");
  });

  it("replaces leading '#' in video correctly", () => {
    const lo = makeLo({ route: "/ok", video: "#video/path" });
    fixRoutePaths(lo);
    expect(lo.video).toBe("/video/path");
  });

  it("does NOT redirect route when route ends with 'md' but video is empty", () => {
    // Kills: `lo.route.endsWith("md") && lo.video` → `... || lo.video`
    const lo = makeLo({ route: "/some/path.md", video: "" });
    fixRoutePaths(lo);
    expect(lo.route).toBe("/some/path.md");
  });

  it("does NOT redirect route when route does NOT end with 'md'", () => {
    const lo = makeLo({ route: "/some/path.html", video: "/video/url" });
    fixRoutePaths(lo);
    expect(lo.route).toBe("/some/path.html");
  });

  it("redirects route to video when route ends with 'md' AND video exists", () => {
    const lo = makeLo({ route: "/some/path.md", video: "/video/url" });
    fixRoutePaths(lo);
    expect(lo.route).toBe("/video/url");
  });

  it("does NOT modify route when route does not start with '#'", () => {
    const lo = makeLo({ route: "/normal/route", video: "" });
    fixRoutePaths(lo);
    expect(lo.route).toBe("/normal/route");
  });
});

// ===========================================================================
// 2. injectCourseUrl — type-specific branches
// ===========================================================================
describe("injectCourseUrl — mutation killing", () => {
  it("constructs archive route from route and archiveFile", () => {
    const lo = makeLo({
      type: "archive",
      route: "/archive/{{COURSEURL}}/stuff",
      img: "{{COURSEURL}}/img.png",
      archiveFile: "archive.zip",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    // archive route: `https://${lo.route?.replace("/archive/{{COURSEURL}}", url)}/${archive.archiveFile}`
    expect(lo.route).toContain("https://");
    expect(lo.route).toContain("https://example.com");
    expect(lo.route).toContain("archive.zip");
  });

  it("replaces {{COURSEURL}} in talk pdf", () => {
    const lo = makeLo({
      type: "talk",
      route: "{{COURSEURL}}/talk-1",
      img: "{{COURSEURL}}/talk.png",
      video: "{{COURSEURL}}/talk-vid",
      pdf: "{{COURSEURL}}/talk.pdf",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    expect(lo.pdf).toBe("https://example.com/talk.pdf");
    expect(lo.route).toContain("course-id");
  });

  it("replaces {{COURSEURL}} in paneltalk pdf", () => {
    const lo = makeLo({
      type: "paneltalk",
      route: "{{COURSEURL}}/pt-1",
      img: "",
      video: "",
      pdf: "{{COURSEURL}}/paneltalk.pdf",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    expect(lo.pdf).toBe("https://example.com/paneltalk.pdf");
  });

  it("replaces {{COURSEURL}} in tutorial pdf", () => {
    const lo = makeLo({
      type: "tutorial",
      route: "{{COURSEURL}}/tut-1",
      img: "",
      video: "",
      pdf: "{{COURSEURL}}/tutorial.pdf",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    expect(lo.pdf).toBe("https://example.com/tutorial.pdf");
  });

  it("replaces {{COURSEURL}} in lab pdf", () => {
    const lo = makeLo({
      type: "lab",
      route: "{{COURSEURL}}/lab-1",
      img: "",
      video: "",
      pdf: "{{COURSEURL}}/lab.pdf",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    expect(lo.pdf).toBe("https://example.com/lab.pdf");
  });

  it("replaces {{COURSEURL}} in img field", () => {
    const lo = makeLo({
      route: "{{COURSEURL}}/note-1",
      img: "{{COURSEURL}}/image.png",
      video: "",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    expect(lo.img).toBe("https://example.com/image.png");
  });

  it("replaces {{COURSEURL}} in video field", () => {
    const lo = makeLo({
      route: "{{COURSEURL}}/note-1",
      img: "",
      video: "{{COURSEURL}}/video.mp4",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    expect(lo.video).toContain("course-id");
    expect(lo.video).toBe("course-id/video.mp4");
  });

  it("replaces {{COURSEURL}} in route for non-archive types", () => {
    const lo = makeLo({
      type: "note",
      route: "{{COURSEURL}}/note-1",
      img: "",
      video: "",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    expect(lo.route).toBe("course-id/note-1");
  });

  it("handles undefined img gracefully (optional chaining)", () => {
    const lo = makeLo({
      type: "note",
      route: "some-route",
      video: "",
    });
    delete lo.img;
    // Should not throw
    injectCourseUrl([lo], "course-id", "https://example.com");
    expect(lo.img).toBeUndefined();
  });

  it("replaces {{COURSEURL}} in whiteboard excalidraw", () => {
    const lo = makeLo({
      type: "whiteboard",
      route: "{{COURSEURL}}/whiteboard-1",
      img: "{{COURSEURL}}/whiteboard.png",
      video: "",
      excalidraw: "{{COURSEURL}}/whiteboard-1/scene.excalidraw",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    expect(lo.excalidraw).toBe("https://example.com/whiteboard-1/scene.excalidraw");
  });

  it("does not replace pdf for note type (no pdf branch)", () => {
    const lo = makeLo({
      type: "note",
      route: "some/route",
      img: "",
      video: "",
      pdf: "{{COURSEURL}}/note.pdf",
    });
    injectCourseUrl([lo], "course-id", "https://example.com");
    // note type does not have a pdf replacement branch
    expect(lo.pdf).toBe("{{COURSEURL}}/note.pdf");
  });
});

// ===========================================================================
// 3. removeLeadingHashes — kill `hashIndex >= 0 ? ... : ...` → `true ? ...`
// ===========================================================================
describe("removeLeadingHashes — mutation killing", () => {
  it("returns original string when no hash present", () => {
    const result = removeLeadingHashes("no-hash-here");
    expect(result).toBe("no-hash-here");
  });

  it("returns substring after last hash", () => {
    const result = removeLeadingHashes("prefix#suffix");
    expect(result).toBe("suffix");
  });

  it("returns empty string when hash is last character", () => {
    const result = removeLeadingHashes("trailing#");
    expect(result).toBe("");
  });

  it("returns substring after the LAST hash for multiple hashes", () => {
    const result = removeLeadingHashes("a#b#c");
    expect(result).toBe("c");
  });

  it("handles empty string (no hash)", () => {
    const result = removeLeadingHashes("");
    expect(result).toBe("");
  });
});

// ===========================================================================
// 4. getUnits — panel type filtering mutations
// ===========================================================================
describe("getUnits — mutation killing for panel type exclusion", () => {
  it("excludes paneltalk from standardLos", () => {
    const los = [
      makeLo({ type: "paneltalk", id: "pt1" }),
      makeLo({ type: "note", id: "n1" }),
    ];
    const units = getUnits(los);
    expect(units.standardLos).toHaveLength(1);
    expect(units.standardLos[0]).toHaveProperty("id", "n1");
    expect(units.standardLos.every((lo: any) => lo.type !== "paneltalk")).toBe(true);
  });

  it("excludes panelnote from standardLos", () => {
    const los = [
      makeLo({ type: "panelnote", id: "pn1" }),
      makeLo({ type: "note", id: "n1" }),
    ];
    const units = getUnits(los);
    expect(units.standardLos).toHaveLength(1);
    expect(units.standardLos[0]).toHaveProperty("id", "n1");
    expect(units.standardLos.every((lo: any) => lo.type !== "panelnote")).toBe(true);
  });

  it("excludes panelvideo from standardLos", () => {
    const los = [
      makeLo({ type: "panelvideo", id: "pv1" }),
      makeLo({ type: "talk", id: "t1" }),
    ];
    const units = getUnits(los);
    expect(units.standardLos).toHaveLength(1);
    expect(units.standardLos[0]).toHaveProperty("id", "t1");
    expect(units.standardLos.every((lo: any) => lo.type !== "panelvideo")).toBe(true);
  });

  it("excludes podcast from standardLos", () => {
    const los = [
      makeLo({ type: "podcast", id: "pc1" }),
      makeLo({ type: "note", id: "n1" }),
    ];
    const units = getUnits(los);
    expect(units.standardLos).toHaveLength(1);
    expect(units.standardLos[0]).toHaveProperty("id", "n1");
    expect(units.standardLos.every((lo: any) => lo.type !== "podcast")).toBe(true);
  });

  it("excludes all panel types and podcasts simultaneously", () => {
    const los = [
      makeLo({ type: "paneltalk", id: "pt1" }),
      makeLo({ type: "panelnote", id: "pn1" }),
      makeLo({ type: "panelvideo", id: "pv1" }),
      makeLo({ type: "podcast", id: "pc1" }),
      makeLo({ type: "unit", id: "u1" }),
      makeLo({ type: "side", id: "s1" }),
      makeLo({ type: "note", id: "n1" }),
      makeLo({ type: "talk", id: "t1" }),
      makeLo({ type: "lab", id: "l1" }),
    ];
    const units = getUnits(los);
    // unit and side are also excluded, plus 4 panel types
    // only note, talk, lab remain as standardLos
    expect(units.standardLos).toHaveLength(3);
    const standardTypes = units.standardLos.map((lo: any) => lo.type);
    expect(standardTypes).not.toContain("paneltalk");
    expect(standardTypes).not.toContain("panelnote");
    expect(standardTypes).not.toContain("panelvideo");
    expect(standardTypes).not.toContain("podcast");
    expect(standardTypes).not.toContain("unit");
    expect(standardTypes).not.toContain("side");
    expect(units.units).toHaveLength(1);
    expect(units.sides).toHaveLength(1);
  });
});

// ===========================================================================
// 5. sortLos — kill `los.filter(...)` → `los` mutation
// ===========================================================================
describe("sortLos — mutation killing", () => {
  it("separates ordered and unordered LOs correctly", () => {
    const ordered1 = makeLo({ id: "o1", frontMatter: { order: 2 } });
    const ordered2 = makeLo({ id: "o2", frontMatter: { order: 1 } });
    const unordered1 = makeLo({ id: "u1", frontMatter: {} });
    const unordered2 = makeLo({ id: "u2", frontMatter: {} });

    const sorted = sortLos([unordered1, ordered1, unordered2, ordered2]);

    // Ordered LOs come first, sorted by order value
    expect((sorted[0] as any).id).toBe("o2"); // order: 1
    expect((sorted[1] as any).id).toBe("o1"); // order: 2
    // Unordered LOs come after, in original relative order
    expect((sorted[2] as any).id).toBe("u1");
    expect((sorted[3] as any).id).toBe("u2");

    // Verify the split: ordered count should be exactly 2
    const orderedFromResult = sorted.slice(0, 2);
    const unorderedFromResult = sorted.slice(2);
    expect(orderedFromResult.every((lo: any) => lo.frontMatter?.order)).toBe(true);
    expect(unorderedFromResult.every((lo: any) => !lo.frontMatter?.order)).toBe(true);
  });

  it("returns all unordered LOs when none have order", () => {
    const los = [
      makeLo({ id: "a", frontMatter: {} }),
      makeLo({ id: "b", frontMatter: {} }),
    ];
    const sorted = sortLos(los);
    expect(sorted).toHaveLength(2);
    expect(sorted.every((lo: any) => !lo.frontMatter?.order)).toBe(true);
  });

  it("returns all ordered LOs when all have order", () => {
    const los = [
      makeLo({ id: "a", frontMatter: { order: 3 } }),
      makeLo({ id: "b", frontMatter: { order: 1 } }),
    ];
    const sorted = sortLos(los);
    expect(sorted).toHaveLength(2);
    expect((sorted[0] as any).id).toBe("b");
    expect((sorted[1] as any).id).toBe("a");
  });

  it("filter mutation: unordered LOs should not have order property", () => {
    // This specifically catches `los.filter((lo) => !lo.frontMatter?.order)` → `los`
    // If the filter is removed, unOrderedLos would contain ordered LOs too,
    // and they'd appear twice in the result (once in ordered, once in unordered concat).
    const los = [
      makeLo({ id: "o1", frontMatter: { order: 1 } }),
      makeLo({ id: "u1", frontMatter: {} }),
    ];
    const sorted = sortLos(los);
    // If filter mutation survives, length would be 3 (o1 in ordered + o1,u1 in unordered)
    expect(sorted).toHaveLength(2);
  });
});

// ===========================================================================
// 6. crumbs — endsWith("/") → true and endsWith → startsWith mutations
// ===========================================================================
describe("crumbs — mutation killing", () => {
  it("does NOT strip anything from route without trailing slash", () => {
    // Kills: `lo.route.endsWith("/")` → `true`
    // If condition always true, route "/course/topic" would become "/course/topi"
    const lo = makeLo({ route: "/course/topic" });
    const trail: any[] = [];
    crumbs(lo, trail);
    expect(trail[0].route).toBe("/course/topic");
  });

  it("strips trailing slash from route", () => {
    const lo = makeLo({ route: "/course/topic/" });
    const trail: any[] = [];
    crumbs(lo, trail);
    expect(trail[0].route).toBe("/course/topic");
  });

  it("does NOT strip from route starting with slash but not ending with it", () => {
    // Kills: `endsWith` → `startsWith` mutation
    // Route starts with "/" but does not end with it — should be unchanged
    const lo = makeLo({ route: "/starts-with-slash" });
    const trail: any[] = [];
    crumbs(lo, trail);
    expect(trail[0].route).toBe("/starts-with-slash");
  });

  it("handles route that both starts and ends with slash", () => {
    const lo = makeLo({ route: "/both/" });
    const trail: any[] = [];
    crumbs(lo, trail);
    expect(trail[0].route).toBe("/both");
  });
});

// ===========================================================================
// 7. getVideoConfig — entire function uncovered
// ===========================================================================
describe("getVideoConfig — full coverage", () => {
  it("returns youtube config for a standard youtube video", () => {
    const lo = makeLo({
      video: "https://www.youtube.com/watch/abc123",
      videoids: {
        videoid: "abc123",
        videoIds: [{ service: "youtube", id: "abc123" }],
      },
    });
    const config = getVideoConfig(lo);
    expect(config.service).toBe("youtube");
    expect(config.id).toBe("abc123");
    expect(config.url).toBe("https://www.youtube.com/embed/abc123");
    expect(config.externalUrl).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("returns heanet config when last video service is heanet", () => {
    const lo = makeLo({
      video: "",
      videoids: {
        videoid: "heanet-vid",
        videoIds: [{ service: "heanet", id: "heanet-vid-123" }],
      },
    });
    const config = getVideoConfig(lo);
    expect(config.service).toBe("heanet");
    expect(config.id).toBe("heanet-vid-123");
    expect(config.url).toBe("https://media.heanet.ie/player/heanet-vid-123");
    expect(config.externalUrl).toBeUndefined();
  });

  it("returns vimp config when last video service is vimp", () => {
    const lo = makeLo({
      video: "",
      videoids: {
        videoid: "vimp-vid",
        videoIds: [{ service: "vimp", id: "vimp-key-456" }],
      },
    });
    const config = getVideoConfig(lo);
    expect(config.service).toBe("vimp");
    expect(config.id).toBe("vimp-key-456");
    expect(config.url).toBe(
      "https://vimp.oth-regensburg.de/media/embed?key=vimp-key-456&autoplay=false&controls=true"
    );
    expect(config.externalUrl).toBeUndefined();
  });

  it("returns default youtube config with empty id when no videoids", () => {
    const lo = makeLo({
      video: "",
      videoids: {
        videoid: "",
        videoIds: [],
      },
    });
    const config = getVideoConfig(lo);
    expect(config.service).toBe("youtube");
    expect(config.id).toBe("");
    // url should still be set for youtube with empty id
    expect(config.url).toBe("https://www.youtube.com/embed/");
    expect(config.externalUrl).toBe("https://www.youtube.com/watch?v=");
  });

  it("extracts video id from video URL path for non-heanet/vimp services", () => {
    const lo = makeLo({
      video: "https://www.youtube.com/watch/myVideoId",
      videoids: {
        videoid: "myVideoId",
        videoIds: [{ service: "youtube", id: "myVideoId" }],
      },
    });
    const config = getVideoConfig(lo);
    expect(config.id).toBe("myVideoId");
  });

  it("handles video URL with trailing slash for youtube", () => {
    // Tests: `parts.pop() || parts.pop()` — first pop gets "", second gets actual id
    const lo = makeLo({
      video: "https://www.youtube.com/watch/myVideoId/",
      videoids: {
        videoid: "myVideoId",
        videoIds: [{ service: "youtube", id: "myVideoId" }],
      },
    });
    const config = getVideoConfig(lo);
    // parts = ["https:", "", "www.youtube.com", "watch", "myVideoId", ""]
    // first pop() -> "", falsy, so second pop() -> "myVideoId"
    expect(config.id).toBe("myVideoId");
  });

  it("uses last video in videoIds array (multiple entries)", () => {
    const lo = makeLo({
      video: "",
      videoids: {
        videoid: "",
        videoIds: [
          { service: "youtube", id: "first" },
          { service: "heanet", id: "last-heanet" },
        ],
      },
    });
    const config = getVideoConfig(lo);
    // Should use the last entry
    expect(config.service).toBe("heanet");
    expect(config.id).toBe("last-heanet");
  });

  it("handles undefined video for youtube parse path (fallback to empty parts)", () => {
    const lo = makeLo({
      videoids: {
        videoid: "vid",
        videoIds: [{ service: "youtube", id: "vid" }],
      },
    });
    delete lo.video;
    const config = getVideoConfig(lo);
    // lo.video?.split("/") is undefined, so falls back to []
    // parts.pop() returns undefined -> falsy, parts.pop() returns undefined -> falsy, default ""
    expect(config.service).toBe("youtube");
    expect(config.id).toBe("");
  });
});
