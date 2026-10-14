import { describe, expect, it } from "vitest";
import {
  assert,
  assertEqual,
  ContractFailure,
  FixedClock,
  FixedSession,
  InMemoryAssignmentSource,
  InMemoryCourseEmitter,
  InMemoryCourseSource,
  InMemoryLearningRecords,
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

  it("InMemoryCourseEmitter remembers each course and its destination", async () => {
    const emitter = new InMemoryCourseEmitter();
    const course = { courseId: "cs101" } as Course;
    await emitter.emit(course, "/tmp/out");
    expect(emitter.emitted).toEqual([{ course, destination: "/tmp/out" }]);
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

  it("InMemoryLearningRecords filters calendar entries, records and learners by course", async () => {
    const records = new InMemoryLearningRecords(
      [
        { id: "2026-01-04", courseid: "cs101", studentid: "ann", pageloads: 1, duration: 1 },
        { id: "2026-01-06", courseid: "cs101", studentid: "ann", pageloads: 1, duration: 1 },
        { id: "2026-01-05", courseid: "cs102", studentid: "ann", pageloads: 1, duration: 1 }
      ] as never,
      [
        { course_id: "cs101", student_id: "ann", lo_id: "/topic/1" },
        { course_id: "cs101", student_id: "bob", lo_id: "/topic/1" },
        { course_id: "cs102", student_id: "cat", lo_id: "/topic/1" }
      ] as never,
      [{ github_id: "ann" }, { github_id: "bob" }, { github_id: "cat" }] as never
    );
    expect((await records.calendarEntries("cs101")).map((e) => e.id)).toEqual(["2026-01-04", "2026-01-06"]);
    expect((await records.calendarEntries("cs101", "2026-01-05", "2026-01-31")).map((e) => e.id)).toEqual(["2026-01-06"]);
    expect((await records.learningRecords("cs101")).map((r) => r.student_id)).toEqual(["ann", "bob"]);
    expect((await records.learningRecords("cs101", "bob")).map((r) => r.student_id)).toEqual(["bob"]);
    expect((await records.learners("cs101")).map((u) => u.github_id)).toEqual(["ann", "bob"]);
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
});
