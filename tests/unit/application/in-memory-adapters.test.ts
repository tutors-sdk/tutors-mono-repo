import { describe, expect, it } from "vitest";
import {
  assert,
  assertEqual,
  ContractFailure,
  FixedClock,
  FixedSession,
  InMemoryAssignmentSource,
  InMemoryCourseCatalogue,
  InMemoryCourseSource,
  InMemoryPresence,
  InMemoryWhiteboard,
  PassThroughRenderer,
  RecordingIdentityClient
} from "@tutors/application/testing";
import { CourseNotFoundError } from "@tutors/application/ports";
import type { Course, Lo } from "@tutors/domain/course";

const location = { courseId: "cs101", courseUrl: "cs101.netlify.app", protocol: "https://" as const };

describe("the in-memory adapters behind every port", () => {
  it("FixedClock stands still until advanced or set", () => {
    const clock = new FixedClock();
    expect(clock.now().toISOString()).toBe("2026-01-05T09:00:00.000Z");
    clock.advance(60_000);
    expect(clock.nowMs()).toBe(Date.parse("2026-01-05T09:01:00.000Z"));
    clock.set("2026-02-01T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("InMemoryCourseSource serves what it was given and reports a missing course as not found", async () => {
    const source = new InMemoryCourseSource({ cs101: { title: "CS101" } });
    source.add("cs102", '{"title":"CS102"}');
    expect(await source.load(location)).toBe('{"title":"CS101"}');
    expect(await source.load({ ...location, courseId: "cs102" })).toBe('{"title":"CS102"}');
    await expect(source.load({ ...location, courseId: "cs103" })).rejects.toBeInstanceOf(CourseNotFoundError);
    expect(source.loads.map((l) => l.courseId)).toEqual(["cs101", "cs102", "cs103"]);
  });

  it("PassThroughRenderer wraps markdown, spots maths and counts maths loads", async () => {
    const renderer = new PassThroughRenderer();
    const lo = { contentMd: "# Hi", summary: "*sum*" } as Lo;
    renderer.renderLo({} as Course, lo, "https://");
    expect(lo.contentHtml).toBe("<p># Hi</p>");
    expect(lo.summary).toBe("<p>*sum*</p>");
    expect(renderer.mayContainMath("$x$")).toBe(true);
    expect(renderer.mayContainMath("plain")).toBe(false);
    await renderer.loadMath();
    expect(renderer.mathLoads).toBe(1);
  });

  it("FixedSession answers with its actor, or nobody", async () => {
    expect(await new FixedSession().getActor()).toBeNull();
    const actor = { id: "ann", roles: [] } as never;
    expect(await new FixedSession(actor).getActor()).toBe(actor);
  });

  it("RecordingIdentityClient keeps the sign-ins and sign-outs asked for", async () => {
    const client = new RecordingIdentityClient();
    await client.signIn("/course/cs101");
    await client.signOut("/");
    expect(client.signIns).toEqual(["/course/cs101"]);
    expect(client.signOuts).toEqual(["/"]);
  });

  it("InMemoryAssignmentSource answers from its sections and the submissions of the assignments asked for", async () => {
    const source = new InMemoryAssignmentSource({ 7: [{ id: 1, name: "Week 1" }] }, { assignments: [{ assignmentid: 1 }, { assignmentid: 2 }] as never });
    expect(await source.courseContents(7)).toEqual([{ id: 1, name: "Week 1" }]);
    expect(await source.courseContents(8)).toEqual([]);
    expect((await source.assignmentSubmissions([2])).assignments.map((a) => a.assignmentid)).toEqual([2]);
  });

  it("the contract assertions fail with a ContractFailure naming the difference", () => {
    expect(() => assert(true, "fine")).not.toThrow();
    expect(() => assert(false, "nope")).toThrow(ContractFailure);
    expect(() => assertEqual([1], [1], "same")).not.toThrow();
    expect(() => assertEqual([1], [2], "lists")).toThrow('lists: expected [2], got [1]');
  });
  it("PassThroughRenderer leaves a learning object with nothing to render as it is", () => {
    const lo = { title: "Empty" } as Lo;
    new PassThroughRenderer().renderLo({} as Course, lo);
    expect(lo).toEqual({ title: "Empty" });
  });

  it("InMemoryCourseCatalogue counts each visit and keeps its own copy of the latest card", async () => {
    const catalogue = new InMemoryCourseCatalogue();
    const card = { id: "cs101", title: "CS101" } as never as Parameters<InMemoryCourseCatalogue["recordVisit"]>[1];
    await catalogue.recordVisit("cs101", card);
    await catalogue.recordVisit("cs101", card);
    await catalogue.recordVisit("cs102", card);
    expect(Object.fromEntries(catalogue.counts)).toEqual({ cs101: 2, cs102: 1 });
    expect(catalogue.records.get("cs101")).toEqual(card);
    expect(catalogue.records.get("cs101")).not.toBe(card);
  });

  it("InMemoryWhiteboard keeps a shared board and a personal one on the same page apart", async () => {
    const boards = new InMemoryWhiteboard();
    const own = { courseId: "cs101", route: "/lab/1", shared: false };
    const shared = { ...own, shared: true };
    expect(await boards.load(own)).toBeNull();
    const elements = [{ id: "a" }];
    expect(await boards.save(own, elements)).toBe(true);
    expect(await boards.save(shared, [{ id: "b" }, { id: "c" }])).toBe(true);
    elements.push({ id: "later" });
    expect(await boards.load(own)).toEqual({ elements: [{ id: "a" }], appState: {}, files: {} });
    expect((await boards.load(shared))!.elements).toHaveLength(2);
  });

  it("InMemoryPresence tells every listener of an event with no learner but stores no snapshot for it, newest first otherwise", async () => {
    const clock = new FixedClock();
    const presence = new InMemoryPresence(clock);
    const heard: string[] = [];
    const stop = presence.subscribe((event) => heard.push(event.loRoute));
    const event = (id: string | undefined, loRoute: string) => ({ courseId: "cs101", loRoute, user: id ? { id } : undefined }) as never;
    await presence.publish(event(undefined, "/a"));
    await presence.publish(event("ann", "/b"));
    clock.advance(1000);
    await presence.publish(event("bob", "/c"));
    stop();
    await presence.publish(event("cat", "/d"));
    expect(heard).toEqual(["/a", "/b", "/c"]);
    const rows = (await presence.recent("cs101", "2000-01-01T00:00:00.000Z"))!;
    expect(rows.map((row) => (row.payload as { loRoute: string }).loRoute)).toEqual(["/d", "/c", "/b"]);
  });
});
