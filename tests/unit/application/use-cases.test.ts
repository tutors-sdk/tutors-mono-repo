import { describe, expect, it } from "vitest";
import { loadContentLocks, loadCourse, recordHeartbeat, recordLearningEvent, setContentLock } from "@tutors/application";
import { FixedClock, InMemoryAccessStore, InMemoryCourseSource, InMemoryLearningEventSink, PassThroughRenderer, RecordingPublisher } from "@tutors/application/testing";

describe("content locks", () => {
  it("reads the course's locks as a route map and writes a lecturer's lock through the store", async () => {
    const store = new InMemoryAccessStore();
    expect(await setContentLock({ store })("cs101", "/lab/cs101/1", true)).toBe("saved");
    expect(await setContentLock({ store })("", "/lab/cs101/1", true)).toBe("unsaved");
    expect(await loadContentLocks({ store })("cs101")).toEqual(new Map([["/lab/cs101/1", true]]));
    expect(await loadContentLocks({ store })("cs102")).toEqual(new Map());
  });

  it("tells the lecturer a change stays in their browser when the store keeps nothing", async () => {
    const store = new InMemoryAccessStore(undefined, { persists: false });
    expect(await setContentLock({ store })("cs101", "/lab/cs101/1", true)).toBe("local");
    expect(await loadContentLocks({ store })("cs101")).toEqual(new Map());
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

  it("hands what the course's own files got wrong to the caller, and still returns the course", async () => {
    const source = new InMemoryCourseSource({ cs101: { ...published, calendar: { title: "S1", weeks: [null] } } });
    const told: unknown[] = [];
    const order: string[] = [];
    const loaded = await loadCourse({
      source,
      renderer: new PassThroughRenderer(),
      clock: new FixedClock(),
      faulted: (c, faults) => {
        order.push("faulted");
        told.push([c.courseId, faults]);
      },
      decorated: () => order.push("decorated")
    })({ courseId: "cs101", courseUrl: "cs101.netlify.app", protocol: "https://" });
    expect(loaded.courseCalendar).toBeUndefined();
    expect(told).toEqual([["cs101", [{ part: "calendar", message: expect.stringMatching(/.+/) }]]]);
    expect(order).toEqual(["faulted", "decorated"]);
  });

  it("tells the caller of no fault when the course has none, and needs no listener when it has one", async () => {
    const told: unknown[] = [];
    const location = { courseId: "cs101", courseUrl: "cs101.netlify.app", protocol: "https://" } as const;
    await loadCourse({ source: new InMemoryCourseSource({ cs101: published }), renderer: new PassThroughRenderer(), clock: new FixedClock(), faulted: (...args) => told.push(args) })(location);
    expect(told).toEqual([]);
    const broken = new InMemoryCourseSource({ cs101: { ...published, calendar: { weeks: [null] } } });
    await expect(loadCourse({ source: broken, renderer: new PassThroughRenderer(), clock: new FixedClock() })(location)).resolves.toMatchObject({ courseId: "cs101" });
  });

  it("reads the current week against the clock it was given", async () => {
    const calendar = { title: "S1", weeks: [{ "2026-09-07": { title: "One", type: "topic" } }, { "2026-09-14": { title: "Two", type: "topic" } }] };
    const source = new InMemoryCourseSource({ cs101: { ...published, calendar } });
    const loaded = await loadCourse({ source, renderer: new PassThroughRenderer(), clock: new FixedClock(Date.parse("2026-09-09T10:00:00Z")) })({
      courseId: "cs101",
      courseUrl: "cs101.netlify.app",
      protocol: "https://"
    });
    expect(loaded.courseCalendar?.currentWeek?.title).toBe("One");
  });
});

describe("recording learning", () => {
  const course = { courseId: "cs101" } as never;
  const lab = { type: "lab", route: "/lab/cs101/topic-1/lab-1" } as never;

  it("records a page load and a tick for the signed-in learner and tells the rest of the application", async () => {
    const events = new InMemoryLearningEventSink();
    const publisher = new RecordingPublisher();
    const deps = { events, clock: new FixedClock(), publish: (event: Parameters<RecordingPublisher["publish"]>[0]) => publisher.publish(event) };
    await recordLearningEvent(deps)({ login: "ann" }, course, lab);
    await recordHeartbeat(deps)({ login: "ann" }, course, lab);
    await recordHeartbeat(deps)({ login: "ann" }, course, null);
    expect(events.recorded.map(({ event, learnerId }) => [event.kind, learnerId, event.courseId, event.day])).toEqual([
      ["page-load", "ann", "cs101", "2026-01-05"],
      ["tick", "ann", "cs101", "2026-01-05"],
      ["tick", "ann", "cs101", "2026-01-05"]
    ]);
    expect(events.recorded[2]!.event.loId).toBeNull();
    expect(publisher.events.map((event) => event.type)).toEqual(["learning", "learning", "learning"]);
  });

  it("records nothing for a visitor who is not signed in, and needs no publisher", async () => {
    const events = new InMemoryLearningEventSink();
    const deps = { events, clock: new FixedClock() };
    for (const visitor of [null, undefined, { login: "" }]) {
      await recordLearningEvent(deps)(visitor, course, lab);
      await recordHeartbeat(deps)(visitor, course, lab);
    }
    expect(events.recorded).toEqual([]);
    await recordHeartbeat(deps)({ login: "ann" }, course, lab);
    expect(events.recorded).toHaveLength(1);
  });
});
