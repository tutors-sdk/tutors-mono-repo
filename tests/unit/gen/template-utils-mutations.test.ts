import { describe, it, expect } from "vitest";
import {
  generateLink,
  tocLink,
  generateVideoLink,
  panoptoEmbedUrl,
  panoptoViewerUrl,
} from "../../../packages/jsr/gen/src/templates/utils.ts";
import type { Lo } from "@tutors/tutors-model-lib";

function makeLo(overrides: Record<string, unknown> = {}): Lo {
  return {
    type: "note",
    id: "lo-1",
    title: "Test LO",
    route: "/note/course-id/topic-1/lo-1",
    img: "",
    imgFile: "",
    video: "",
    videoids: { videoid: "", videoIds: [] },
    ...overrides,
  } as unknown as Lo;
}

describe("generateLink absolute links strip the protocol", () => {
  it("strips a triple-slash (file:///) protocol completely", () => {
    const lo = makeLo({ type: "archive", route: "file:///srv/course/a.zip" });
    expect(generateLink(lo, true)).toBe("srv/course/a.zip");
  });
  it("strips a triple-slash protocol for page-like types before appending index.html", () => {
    const lo = makeLo({ type: "lab", route: "file:///course/topic/book-1" });
    expect(generateLink(lo, true)).toBe("course/topic/book-1/index.html");
  });
  it("strips the protocol from an archive route instead of returning it unchanged", () => {
    const lo = makeLo({ type: "archive", route: "https://host/course/a.zip" });
    expect(generateLink(lo, true)).toBe("host/course/a.zip");
  });
  it("returns other types' routes unchanged", () => {
    const lo = makeLo({ type: "panelvideo", route: "https://host/v" });
    expect(generateLink(lo, true)).toBe("https://host/v");
  });
});

describe("tocLink depth", () => {
  it("counts a host with no path as one level", () => {
    const from = makeLo({ route: "https://host" });
    const to = makeLo({ type: "web", route: "https://elsewhere.example" });
    expect(tocLink(from, to)).toBe("../https://elsewhere.example");
  });
  it("adds one level per path segment", () => {
    const from = makeLo({ route: "https://host/a/b" });
    const to = makeLo({ type: "archive", route: "https://host/z.zip" });
    expect(tocLink(from, to)).toBe("../../../host/z.zip");
  });
});

describe("generateVideoLink", () => {
  it("uses the panopto viewer URL when the last video is panopto", () => {
    const lo = makeLo({
      videoids: {
        videoid: "p-1",
        videoIds: [
          { service: "youtube", id: "yt" },
          { service: "panopto", id: "tenant.hosted.panopto.com|p-1" },
        ],
      },
    });
    expect(generateVideoLink(lo)).toBe(panoptoViewerUrl("tenant.hosted.panopto.com|p-1"));
    expect(generateVideoLink(lo)).toBe("https://tenant.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=p-1");
  });
  it("uses the youtube id when panopto is not the last entry", () => {
    const lo = makeLo({
      videoids: {
        videoid: "yt",
        videoIds: [
          { service: "panopto", id: "h|p" },
          { service: "youtube", id: "yt" },
        ],
      },
    });
    expect(generateVideoLink(lo)).toBe("https://www.youtube.com/watch?v=yt");
  });
  it("returns an empty string when the lo has no videoids", () => {
    expect(generateVideoLink(makeLo({ videoids: undefined }))).toBe("");
  });
  it("falls back to videoid when the videoIds list is absent", () => {
    const lo = makeLo({ videoids: { videoid: "abc" } });
    expect(generateVideoLink(lo)).toBe("https://www.youtube.com/watch?v=abc");
  });
  it("returns an empty string for a missing lo", () => {
    expect(generateVideoLink(undefined as unknown as Lo)).toBe("");
  });
});

describe("panopto url helpers", () => {
  it("builds embed and viewer urls for a host|id pair", () => {
    expect(panoptoViewerUrl("x.panopto.eu|abc")).toBe("https://x.panopto.eu/Panopto/Pages/Viewer.aspx?id=abc");
    expect(panoptoEmbedUrl("x.panopto.eu|abc")).toMatch(/^https:\/\/x\.panopto\.eu\/Panopto\/Pages\/Embed\.aspx\?id=abc&autoplay=false/);
  });
});
