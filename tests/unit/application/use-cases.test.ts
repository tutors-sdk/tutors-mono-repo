import { describe, expect, it } from "vitest";
import { loadContentLocks, loadCourse, setContentLock } from "@tutors/application";
import { FixedClock, InMemoryAccessStore, InMemoryCourseSource, PassThroughRenderer } from "@tutors/application/testing";

describe("content locks", () => {
  it("reads the course's locks as a route map and writes a lecturer's lock through the store", async () => {
    const store = new InMemoryAccessStore();
    expect(await setContentLock({ store })("cs101", "/lab/cs101/1", true, "lecturer")).toBe(true);
    expect(await setContentLock({ store })("", "/lab/cs101/1", true, "lecturer")).toBe(false);
    expect(await loadContentLocks({ store })("cs101")).toEqual(new Map([["/lab/cs101/1", true]]));
    expect(await loadContentLocks({ store })("cs102")).toEqual(new Map());
  });
});

describe("loadCourse", () => {
  const published = {
    id: "cs101",
    title: "CS101",
    type: "course",
    route: "/course/cs101",
    summary: "A $course$",
    contentMd: "# CS101",
    properties: {},
    los: [{ id: "topic-1", title: "Topic 1", type: "topic", route: "/topic/cs101/topic-1", summary: "t", contentMd: "# T", los: [] }]
  };

  it("loads the text, loads maths when the text calls for it, and renders every learning object by default", async () => {
    const source = new InMemoryCourseSource({ cs101: published });
    const renderer = new PassThroughRenderer();
    const decorated: string[] = [];
    const loaded = await loadCourse({ source, renderer, clock: new FixedClock(), decorated: (c) => decorated.push(c.courseId) })({
      courseId: "cs101",
      courseUrl: "cs101.netlify.app",
      protocol: "https://"
    });
    expect(loaded.courseId).toBe("cs101");
    expect(renderer.mathLoads).toBe(1);
    expect(loaded.los[0].contentHtml).toBe("<p># T</p>");
    expect(decorated).toEqual(["cs101"]);
  });

  it("renders through the caller's render step when one is given, and skips maths when the text has none", async () => {
    const source = new InMemoryCourseSource({ cs101: { ...published, summary: "plain" } });
    const renderer = new PassThroughRenderer();
    const rendered: string[] = [];
    await loadCourse({ source, renderer, clock: new FixedClock(), render: (_c, lo) => rendered.push(lo.type) })({
      courseId: "cs101",
      courseUrl: "cs101.netlify.app",
      protocol: "https://"
    });
    expect(renderer.mathLoads).toBe(0);
    expect(rendered).toContain("topic");
  });
});
