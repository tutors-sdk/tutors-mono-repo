import { afterEach, describe, expect, it, vi } from "vitest";
import type { Course, Lab, Lo, Note, Notebook } from "@tutors/tutors-model-lib";
import { currentCourse, currentLo } from "../../../packages/adapters/driving/svelte-state/src/index.svelte.ts";
import { addTransport, removeTransport, type LogEntry } from "../../../packages/platform/logger/src/index.ts";
import { courseService } from "../../../packages/adapters/driving/svelte-state/src/course/services/course.svelte.ts";
import { anonymousReader } from "../../support/reader-adapters.ts";

// `rune()` wraps a value in `$state`, which needs the Svelte compiler; the service only reads and writes `.value`.
vi.mock("../../../packages/adapters/driving/svelte-state/src/index.svelte.ts", () => {
  const rune = <T>(value: T) => ({ value });
  return { rune, courseProtocol: rune("https://"), currentCourse: rune(null), currentLo: rune(null), isEducator: rune(false) };
});

anonymousReader();

/** A course host that must not be asked: every course here is already in the cache. */
const unreachable = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;

const COURSE_ID = "content-course";

function cached(los: Lo[], extra: Record<string, unknown> = {}): Course {
  const course = { courseId: COURSE_ID, courseUrl: "example.invalid", loIndex: new Map(los.map((lo) => [lo.route, lo])), ...extra } as unknown as Course;
  courseService.courses.set(COURSE_ID, course);
  return course;
}

afterEach(() => {
  courseService.courses.clear();
  courseService.labs.clear();
  courseService.notes.clear();
  courseService.notebooks.clear();
  currentLo.value = null;
  currentCourse.value = null;
});

describe("courseService.readWall", () => {
  it("returns the learning objects of the asked type", async () => {
    const talk = { type: "talk", route: "/talk/content-course/t1" } as Lo;
    cached([talk], { wallMap: new Map([["talk", [talk]]]) });
    expect(await courseService.readWall(COURSE_ID, "talk", unreachable)).toEqual([talk]);
  });

  it("returns nothing for a type the course has none of, or a course with no walls", async () => {
    cached([], { wallMap: new Map() });
    expect(await courseService.readWall(COURSE_ID, "lab", unreachable)).toEqual([]);
    cached([]);
    expect(await courseService.readWall(COURSE_ID, "lab", unreachable)).toEqual([]);
  });
});

describe("courseService.readLo", () => {
  it("renders a note once, keeps it, and makes it the current learning object", async () => {
    const route = "/note/content-course/topic/note-1";
    const note = { type: "note", route, contentMd: "# First" } as Note;
    cached([note]);

    expect(await courseService.readLo(COURSE_ID, route, unreachable)).toBe(note);
    expect(note.contentHtml).toContain("First");
    expect(courseService.notes.get(route)).toBe(note);
    expect(courseService.notebooks.has(route)).toBe(false);
    expect(currentLo.value).toBe(note);

    // A kept note is not rendered again: what the page shows stays what was rendered first.
    note.contentMd = "# Second";
    await courseService.readLo(COURSE_ID, route, unreachable);
    expect(note.contentHtml).toContain("First");
    expect(note.contentHtml).not.toContain("Second");
  });

  it("keeps a notebook it reads and nothing else", async () => {
    const route = "/notebook/content-course/nb";
    const notebook = { type: "notebook", route, cells: [{ cellType: "markdown", source: "## Part", outputs: [] }] } as unknown as Notebook;
    const talk = { type: "talk", route: "/talk/content-course/t1" } as Lo;
    cached([notebook, talk]);

    expect(await courseService.readLo(COURSE_ID, talk.route, unreachable)).toBe(talk);
    expect(courseService.notebooks.size).toBe(0);
    expect(courseService.notes.size).toBe(0);

    await courseService.readLo(COURSE_ID, route, unreachable);
    const live = courseService.notebooks.get(route);
    expect(live?.notebook).toBe(notebook);
    await courseService.readLo(COURSE_ID, route, unreachable);
    expect(courseService.notebooks.get(route)).toBe(live);
  });

  it("answers with the course, which stays the current learning object, for an address the course does not have", async () => {
    const talk = { type: "talk", route: "/talk/content-course/t1" } as Lo;
    const course = cached([talk]);
    await courseService.readLo(COURSE_ID, talk.route, unreachable);
    expect(await courseService.readLo(COURSE_ID, "/talk/content-course/missing", unreachable)).toBe(course);
    expect(currentLo.value).toBe(course);
  });
});

describe("courseService.readLab", () => {
  const labRoute = "/lab/content-course/topic/book-1";
  const lab = () =>
    ({
      type: "lab",
      route: labRoute,
      los: [
        { shortTitle: "01", title: "# One", contentMd: "step one" },
        { shortTitle: "02", title: "# Two", contentMd: "step two" }
      ]
    }) as unknown as Lab;

  it("finds the lab from the address of one of its steps and keeps one live lab for all of them", async () => {
    const theLab = lab();
    cached([theLab]);

    const fromStep = await courseService.readLab(COURSE_ID, `${labRoute}/02`, unreachable);
    expect(fromStep.lab).toBe(theLab);
    expect(theLab.los[0].contentHtml).toContain("step one");
    expect([...courseService.labs.keys()]).toEqual([labRoute]);
    expect(currentLo.value).toBe(theLab);

    // The lab's own address ends in its folder, which starts with "book": nothing is cut from it.
    expect(await courseService.readLab(COURSE_ID, labRoute, unreachable)).toBe(fromStep);
    expect(await courseService.readLab(COURSE_ID, `${labRoute}/01`, unreachable)).toBe(fromStep);
    expect(courseService.labs.size).toBe(1);
  });

  it("refreshAllLabs renders kept labs, notes and notebooks again from their markdown", async () => {
    const theLab = lab();
    const note = { type: "note", route: "/note/content-course/topic/note-1", contentMd: "note one" } as Note;
    const notebook = { type: "notebook", route: "/notebook/content-course/nb", cells: [{ cellType: "markdown", source: "## Part", outputs: [] }] } as unknown as Notebook;
    currentCourse.value = cached([theLab, note, notebook]);
    const live = await courseService.readLab(COURSE_ID, labRoute, unreachable);
    await courseService.readLo(COURSE_ID, note.route, unreachable);
    const liveNotebook = await courseService.readNotebook(COURSE_ID, notebook.route, unreachable);
    live.currentChapterShortTitle = "01";

    theLab.los[0].contentMd = "step one, edited";
    note.contentMd = "note one, edited";
    notebook.cells[0].source = "## Part, edited";
    courseService.refreshAllLabs();

    expect(live.content).toContain("step one, edited");
    expect(note.contentHtml).toContain("note one, edited");
    expect(notebook.cells[0].sourceHtml).toContain("Part, edited");
    expect(liveNotebook.notebook).toBe(notebook);
  });
});

describe("courseService: a course that arrives and cannot be built", () => {
  it("is logged once with the address it came from; a failed fetch is left to the course source's own log", async () => {
    const entries: LogEntry[] = [];
    const transport = (entry: LogEntry) => void entries.push(entry);
    addTransport(transport);
    try {
      const notACourse = (async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
      await expect(courseService.getOrLoadCourse("broken-course", notACourse)).rejects.toBeDefined();
      const logged = entries.filter((entry) => entry.message === "Error fetching course");
      expect(logged.map((entry) => [entry.courseId, entry.url])).toEqual([["broken-course", "https://broken-course.netlify.app/tutors.json"]]);

      entries.length = 0;
      const refused = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
      await expect(courseService.getOrLoadCourse("refused-course", refused)).rejects.toThrow(/^Fetch failed/);
      expect(entries.filter((entry) => entry.url === "https://refused-course.netlify.app/tutors.json")).toHaveLength(1);
    } finally {
      removeTransport(transport);
    }
  });
});
