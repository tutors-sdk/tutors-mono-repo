import { describe, it, expect } from "vitest";
import {
  injectCourseUrl,
  removeUnknownLos,
  sortLos,
  getPanoptoUrls,
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
// 1. injectCourseUrl — optional fields absent
// ===========================================================================
describe("injectCourseUrl — absent optional fields", () => {
  it("builds an archive route even when the archive has no route", () => {
    const lo = makeLo({ type: "archive", route: undefined, archiveFile: "a.zip" });
    injectCourseUrl([lo], "cid", "cid.netlify.app");
    expect(lo.route).toBe("https://undefined/a.zip");
  });

  it("leaves an undefined talk pdf undefined", () => {
    const lo = makeLo({ type: "talk", route: "/talk/{{COURSEURL}}/t" });
    injectCourseUrl([lo], "cid", "cid.netlify.app");
    expect(lo.pdf).toBeUndefined();
    expect(lo.route).toBe("/talk/cid/t");
  });

  it("leaves an undefined lab pdf undefined", () => {
    const lo = makeLo({ type: "lab", route: "/lab/{{COURSEURL}}/l" });
    injectCourseUrl([lo], "cid", "cid.netlify.app");
    expect(lo.pdf).toBeUndefined();
    expect(lo.route).toBe("/lab/cid/l");
  });

  it("leaves an undefined whiteboard excalidraw undefined", () => {
    const lo = makeLo({ type: "whiteboard", route: "/whiteboard/{{COURSEURL}}/w" });
    injectCourseUrl([lo], "cid", "cid.netlify.app");
    expect(lo.excalidraw).toBeUndefined();
    expect(lo.route).toBe("/whiteboard/cid/w");
  });

  it("does not add an excalidraw property to non-whiteboard los", () => {
    const lo = makeLo({ type: "note", route: "/note/{{COURSEURL}}/n" });
    injectCourseUrl([lo], "cid", "cid.netlify.app");
    expect(Object.prototype.hasOwnProperty.call(lo, "excalidraw")).toBe(false);
  });

  it("strips legacy hash routes after injecting the course id", () => {
    const lo = makeLo({ route: "#note/{{COURSEURL}}/n", video: "#video/{{COURSEURL}}/v" });
    injectCourseUrl([lo], "cid", "cid.netlify.app");
    expect(lo.route).toBe("/note/cid/n");
    expect(lo.video).toBe("/video/cid/v");
  });
});

// ===========================================================================
// 2. removeUnknownLos — first element
// ===========================================================================
describe("removeUnknownLos — boundary", () => {
  it("removes an unknown lo at index 0", () => {
    const los = [makeLo({ type: "unknown", id: "u" }), makeLo({ id: "n" })];
    removeUnknownLos(los);
    expect(los.map((l) => l.id)).toEqual(["n"]);
  });
});

// ===========================================================================
// 3. sortLos — null order
// ===========================================================================
describe("sortLos — null order is treated as unordered", () => {
  it("puts a lo with order null after the ordered los", () => {
    const nullLo = makeLo({ id: "null", frontMatter: { order: null } });
    const one = makeLo({ id: "one", frontMatter: { order: 1 } });
    expect(sortLos([nullLo, one]).map((l) => l.id)).toEqual(["one", "null"]);
  });

  it("puts a lo with no frontMatter order after the ordered los", () => {
    const none = makeLo({ id: "none", frontMatter: {} });
    const one = makeLo({ id: "one", frontMatter: { order: 5 } });
    expect(sortLos([none, one]).map((l) => l.id)).toEqual(["one", "none"]);
  });
});

// ===========================================================================
// 4. getPanoptoUrls — trimming and unparseable ids
// ===========================================================================
describe("getPanoptoUrls — edge cases", () => {
  it("trims whitespace around a host|id pair", () => {
    const { viewerUrl } = getPanoptoUrls("  uni.panopto.eu|abc-123  ");
    expect(viewerUrl).toBe("https://uni.panopto.eu/Panopto/Pages/Viewer.aspx?id=abc-123");
  });

  it("treats a bare id that is not a URL as the session id with an empty host", () => {
    const { viewerUrl, embedUrl } = getPanoptoUrls(" abc-123 ");
    expect(viewerUrl).toBe("https:///Panopto/Pages/Viewer.aspx?id=abc-123");
    expect(embedUrl.startsWith("https:///Panopto/Pages/Embed.aspx?id=abc-123&autoplay=false")).toBe(true);
  });
});

// ===========================================================================
// 5. getVideoConfig — hosted video line parsing and fallbacks
// ===========================================================================
describe("getVideoConfig — hosted line parsing", () => {
  it("does not treat a service name without '=' as a hosted line", () => {
    const config = getVideoConfig(makeLo({ videoids: { videoid: "heanetX", videoIds: [] } }));
    expect(config.service).toBe("youtube");
    expect(config.id).toBe("heanetX");
    expect(config.url).toBe("https://www.youtube.com/embed/heanetX");
  });

  it("trims whitespace around the service and id of a hosted line", () => {
    const config = getVideoConfig(makeLo({ videoids: { videoid: " heanet = abc123 ", videoIds: [] } }));
    expect(config.service).toBe("heanet");
    expect(config.id).toBe("abc123");
    expect(config.url).toBe("https://media.heanet.ie/player/abc123");
  });

  it("returns the youtube default when videoids has a videoid but no videoIds array", () => {
    const config = getVideoConfig(makeLo({ videoids: { videoid: "yt1" } }));
    expect(config).toEqual({
      service: "youtube",
      id: "yt1",
      url: "https://www.youtube.com/embed/yt1",
      externalUrl: "https://www.youtube.com/watch?v=yt1",
    });
  });

  it("returns an empty youtube config when the lo has no videoids", () => {
    const lo = makeLo();
    delete lo.videoids;
    const config = getVideoConfig(lo);
    expect(config).toEqual({
      service: "youtube",
      id: "",
      url: "https://www.youtube.com/embed/",
      externalUrl: "https://www.youtube.com/watch?v=",
    });
  });

  it("returns an empty youtube config when videoids has neither entries nor videoid", () => {
    const config = getVideoConfig(makeLo({ videoids: { videoid: "", videoIds: [] } }));
    expect(config.service).toBe("youtube");
    expect(config.id).toBe("");
  });

  it("uses a hosted line found in the video path when the last entry is youtube", () => {
    const config = getVideoConfig(
      makeLo({
        video: "/video/cid/vimp=key9",
        videoids: { videoid: "ignored", videoIds: [{ service: "youtube", id: "yt1" }] },
      }),
    );
    expect(config.service).toBe("vimp");
    expect(config.id).toBe("key9");
    expect(config.url).toBe("https://vimp.oth-regensburg.de/media/embed?key=key9&autoplay=false&controls=true");
  });

  it("uses a hosted videoid when neither the last entry nor the path is hosted", () => {
    const config = getVideoConfig(
      makeLo({
        video: "/video/cid/yt1",
        videoids: { videoid: "heanet=h42", videoIds: [{ service: "youtube", id: "yt1" }] },
      }),
    );
    expect(config.service).toBe("heanet");
    expect(config.id).toBe("h42");
    expect(config.url).toBe("https://media.heanet.ie/player/h42");
  });

  it("falls back to the path id when nothing is hosted", () => {
    const config = getVideoConfig(
      makeLo({
        video: "/video/cid/pathId",
        videoids: { videoid: "other", videoIds: [{ service: "youtube", id: "yt1" }] },
      }),
    );
    expect(config.service).toBe("youtube");
    expect(config.id).toBe("pathId");
    expect(config.url).toBe("https://www.youtube.com/embed/pathId");
  });
});
