import { describe, expect, it } from "vitest";
import { decorateCourseTree, decorateLoTree } from "../../../packages/domain/src/course/services/lo-tree.ts";
import { courseProtocolOf } from "../../../packages/domain/src/course/address.ts";
import { getPanoptoUrls, injectCourseUrl, sortLos } from "../../../packages/domain/src/course/utils/lo-utils.ts";

/**
 * What the domain's course tree takes from outside itself: a renderer, today's date, the protocol the
 * course is served on and what to leave out of the route index. And the Panopto address parsing the
 * domain does without the URL global.
 */
function makeLo(type: string, route: string, overrides: Record<string, unknown> = {}): any {
  return { type, id: `${type}-id`, title: type, summary: "", contentMd: "", route, img: "", video: "", hide: false, frontMatter: {}, ...overrides };
}

function build() {
  const talk = makeLo("talk", "https://{{COURSEURL}}/topic-01/talk-1", {
    video: "https://{{COURSEURL}}/video/talk-1",
    img: "https://{{COURSEURL}}/talk-1.png",
    pdf: "https://{{COURSEURL}}/talk-1.pdf"
  });
  const board = makeLo("whiteboard", "/whiteboard/{{COURSEURL}}/topic-01/board", { excalidraw: "https://{{COURSEURL}}/board.excalidraw" });
  const web = makeLo("web", "https://example.org/reading");
  const bare = makeLo("note", "/note/{{COURSEURL}}/topic-01/note-1", { video: undefined, img: undefined });
  const topic = makeLo("topic", "/topic/{{COURSEURL}}/topic-01", { los: [talk, board, web, bare] });
  const course = makeLo("course", "/", {
    los: [topic],
    properties: {},
    calendar: { title: "Cal", weeks: [{ date: "2026-09-07", week: 1, topic: "One" }, { date: "2026-09-14", week: 2, topic: "Two" }, { date: "2026-09-21", week: 3, topic: "Three" }] }
  });
  return { course, topic, talk, board, web, bare };
}

describe("decorateCourseTree options", () => {
  it("serves a course on https unless it is told otherwise, and remembers which", () => {
    const plain = build();
    decorateCourseTree(plain.course, "cid", "cid.netlify.app");
    expect(courseProtocolOf(plain.course)).toBe("https://");
    expect(plain.talk.route).toBe("https://cid/topic-01/talk-1");
    expect(plain.talk.pdf).toBe("https://cid.netlify.app/talk-1.pdf");

    const local = build();
    decorateCourseTree(local.course, "cid", "localhost:3000", { protocol: "http://" });
    expect(courseProtocolOf(local.course)).toBe("http://");
  });

  it("rewrites every https link of a course served over http, and leaves absent ones absent", () => {
    const { course, talk, board, bare } = build();
    decorateCourseTree(course, "cid", "localhost:3000", { protocol: "http://" });
    expect(talk.route).toBe("http://cid/topic-01/talk-1");
    expect(talk.video).toBe("http://cid/video/talk-1");
    expect(talk.img).toBe("http://localhost:3000/talk-1.png");
    expect(talk.pdf).toBe("http://localhost:3000/talk-1.pdf");
    expect(board.excalidraw).toBe("http://localhost:3000/board.excalidraw");
    expect(bare.video).toBeUndefined();
    expect(bare.img).toBeUndefined();
    expect("pdf" in bare).toBe(false);
    expect("excalidraw" in bare).toBe(false);
    expect("excalidraw" in talk).toBe(false);
    expect("pdf" in board).toBe(false);
  });

  it("rewrites nothing for any other protocol", () => {
    const { course, talk } = build();
    decorateCourseTree(course, "cid", "cid.netlify.app", { protocol: "https://" });
    expect(talk.video).toBe("https://cid/video/talk-1");
  });

  it("indexes every learning object by route unless the caller leaves some out", () => {
    const all = build();
    decorateCourseTree(all.course, "cid", "cid.netlify.app");
    expect(all.course.loIndex.has("https://example.org/reading")).toBe(true);
    expect(all.course.loIndex.has("/topic/cid/topic-01")).toBe(true);

    const some = build();
    decorateCourseTree(some.course, "cid", "cid.netlify.app", { omitFromIndex: (lo) => lo.type === "web" });
    expect(some.course.loIndex.has("https://example.org/reading")).toBe(false);
    expect(some.course.loIndex.has("/topic/cid/topic-01")).toBe(true);
    expect(some.course.loIndex.has("/whiteboard/cid/topic-01/board")).toBe(true);
    // Left out of the index only: the learning object is still in the tree.
    expect(some.topic.los).toContain(some.web);
  });

  it("applies the renderer to every learning object, and renders nothing without one", () => {
    const rendered: string[] = [];
    const { course } = build();
    decorateCourseTree(course, "cid", "cid.netlify.app", { render: (owner, lo) => rendered.push(`${owner.courseId}:${lo.type}`) });
    expect(rendered.sort()).toEqual(["cid:course", "cid:note", "cid:talk", "cid:topic", "cid:web", "cid:whiteboard"]);

    const plain = build();
    expect(() => decorateCourseTree(plain.course, "cid", "cid.netlify.app")).not.toThrow();
    expect(() => decorateLoTree(plain.course, makeLo("note", "/note/x"))).not.toThrow();
  });

  it("reads the current week against the date it is given", () => {
    const { course } = build();
    decorateCourseTree(course, "cid", "cid.netlify.app", { today: Date.parse("2026-09-16T12:00:00Z") });
    expect(course.courseCalendar.currentWeek.title).toBe("Two");
  });
});

describe("a Panopto video address", () => {
  const urls = (id: string) => getPanoptoUrls(id);
  const viewer = (host: string, session: string) => `https://${host}/Panopto/Pages/Viewer.aspx?id=${session}`;

  it("takes the host and the session from host|session", () => {
    expect(urls(" setu.cloud.panopto.eu|abc-123 ").viewerUrl).toBe(viewer("setu.cloud.panopto.eu", "abc-123"));
  });

  it("takes them from a full address, whatever else the query holds and in whatever order", () => {
    expect(urls("https://setu.cloud.panopto.eu/Panopto/Pages/Viewer.aspx?id=abc-123").viewerUrl).toBe(viewer("setu.cloud.panopto.eu", "abc-123"));
    expect(urls("https://setu.cloud.panopto.eu/Panopto/Pages/Embed.aspx?autoplay=false&id=abc-123&start=5#t").viewerUrl).toBe(viewer("setu.cloud.panopto.eu", "abc-123"));
    expect(urls("https://setu.cloud.panopto.eu/x?flag&id=abc").viewerUrl).toBe(viewer("setu.cloud.panopto.eu", "abc"));
    expect(urls("https://setu.cloud.panopto.eu/x?=orphan&id=abc").viewerUrl).toBe(viewer("setu.cloud.panopto.eu", "abc"));
  });

  it("takes the first id when there are several, and an empty one when it has no value", () => {
    expect(urls("https://h.example/x?id=first&id=second").viewerUrl).toBe(viewer("h.example", "first"));
    expect(urls("https://h.example/x?id").viewerUrl).toBe(viewer("h.example", ""));
    expect(urls("https://h.example/x?id&id=second").viewerUrl).toBe(viewer("h.example", ""));
    expect(urls("https://h.example/x?id=").viewerUrl).toBe(viewer("h.example", ""));
    expect(urls("https://h.example/x?other=1").viewerUrl).toBe(viewer("h.example", ""));
    expect(urls("https://h.example/x").viewerUrl).toBe(viewer("h.example", ""));
  });

  it("decodes the session and its key, and keeps a value that will not decode", () => {
    expect(urls("https://h.example/x?id=a%20b+c").viewerUrl).toBe(viewer("h.example", "a b c"));
    expect(urls("https://h.example/x?i%64=abc").viewerUrl).toBe(viewer("h.example", "abc"));
    expect(urls("https://h.example/x?id=%E0%A4%A").viewerUrl).toBe(viewer("h.example", "%E0%A4%A"));
  });

  it("keeps the colons of an IPv6 host and drops only its port", () => {
    expect(getPanoptoUrls("https://[::1]:8443/Panopto/Pages/Viewer.aspx?id=abc").viewerUrl).toBe("https://[::1]/Panopto/Pages/Viewer.aspx?id=abc");
  });

  it("gives the host as URL.hostname would: lower case, no credentials, no port", () => {
    expect(urls("https://SETU.Cloud.Panopto.EU/x?id=a").viewerUrl).toBe(viewer("setu.cloud.panopto.eu", "a"));
    expect(urls("https://user:pass@h.example:8443/x?id=a").viewerUrl).toBe(viewer("h.example", "a"));
    expect(urls("https://a@b@h.example/x?id=a").viewerUrl).toBe(viewer("h.example", "a"));
    expect(urls("https://h.example:/x?id=a").viewerUrl).toBe(viewer("h.example", "a"));
    expect(urls("https://h.example:80/x?id=a").viewerUrl).toBe(viewer("h.example", "a"));
    expect(urls("https://h.example?id=a").viewerUrl).toBe(viewer("h.example", "a"));
  });

  it("treats anything that is not an address as a bare session with no host", () => {
    expect(urls("abc-123").viewerUrl).toBe(viewer("", "abc-123"));
    expect(urls("see https://h.example/x?id=a").viewerUrl).toBe(viewer("", "see https://h.example/x?id=a"));
    expect(urls("1https://h.example/x?id=a").viewerUrl).toBe(viewer("", "1https://h.example/x?id=a"));
  });

  it("builds the embed address from the same host and session", () => {
    expect(urls("h.example|abc").embedUrl).toBe("https://h.example/Panopto/Pages/Embed.aspx?id=abc&autoplay=false&offerviewer=true&showtitle=true&showbrand=true&captions=false&interactivity=all");
  });
});

describe("learning-object details the tree relies on", () => {
  it("gives a tutorial without a pdf no pdf at all", () => {
    const without = makeLo("tutorial", "/tutorial/{{COURSEURL}}/t");
    const withPdf = makeLo("tutorial", "/tutorial/{{COURSEURL}}/t", { pdf: "https://{{COURSEURL}}/t.pdf" });
    injectCourseUrl([without, withPdf], "cid", "cid.netlify.app");
    expect("pdf" in without).toBe(false);
    expect(withPdf.pdf).toBe("https://cid.netlify.app/t.pdf");
  });

  it("orders by a numeric order, 0 included, and leaves an empty or missing order unordered", () => {
    const blank = makeLo("note", "/a", { frontMatter: { order: "" } });
    const two = makeLo("note", "/b", { frontMatter: { order: 2 } });
    const zero = makeLo("note", "/c", { frontMatter: { order: 0 } });
    const none = makeLo("note", "/d");
    const word = makeLo("note", "/e", { frontMatter: { order: "first" } });
    const nothing = makeLo("note", "/f", { frontMatter: { order: null } });
    expect(sortLos([blank, two, zero, none, word, nothing]).map((lo) => lo.route)).toEqual(["/c", "/b", "/a", "/d", "/e", "/f"]);
  });
});
