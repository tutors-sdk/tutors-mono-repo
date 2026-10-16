/**
 * The reader's notes panel state (notesService in @tutors/course/notes): the note on screen, the panel kept as
 * the learner left it, saving once typing settles, exports, deleting a course's notes, and the
 * session-only fallback when the browser refuses notes (Rules 0380 to 0383).
 */
import "../../bdd/support/svelte-runes-shim.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notesService,
  readPanelState,
  NOTE_SAVE_DELAY_MS,
  NOTES_PANEL_KEY,
  NOTES_PANEL_MAX_WIDTH,
  NOTES_PANEL_MIN_WIDTH
} from "../../../packages/svelte/course/src/notes/notes.svelte.ts";
import { stepKey, type Note, type NotesStore, type StepRef } from "../../../packages/svelte/course/src/notes/notes.ts";

/** Notes held in a map, refusing every call while `failing`, as a browser with no storage does. */
class InMemoryNotesStore implements NotesStore {
  readonly notes = new Map<string, Note>();
  failing = false;
  private check() {
    if (this.failing) throw new Error("storage unavailable");
  }
  async get(ref: StepRef) {
    this.check();
    return this.notes.get(stepKey(ref)) ?? null;
  }
  async put(note: Note) {
    this.check();
    this.notes.set(stepKey(note.ref), note);
  }
  async remove(ref: StepRef) {
    this.check();
    this.notes.delete(stepKey(ref));
  }
  async forCourse(courseId: string) {
    this.check();
    return [...this.notes.values()].filter((n) => n.ref.courseId === courseId);
  }
}

const now = () => new Date("2026-01-05T09:00:00.000Z");

const LAB = "/lab/cs101/lab-01";
const at = (stepId: string, labRoute = LAB, courseId = "cs101"): StepRef => ({ courseId, labRoute, stepId });
const readerUrl = (ref: StepRef) => `https://reader.example${ref.labRoute}/${ref.stepId}`;
const target = { courseId: "cs101", title: "Web Development", readerUrl };

let store: InMemoryNotesStore;
let items: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  items = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k)
  });
  store = new InMemoryNotesStore();
  notesService.reset();
  notesService.configure({ store, now });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  notesService.reset();
});

const type = async (text: string) => {
  notesService.edit(text);
  await vi.advanceTimersByTimeAsync(NOTE_SAVE_DELAY_MS);
};

describe("notesService: the note on screen", () => {
  it("shows the step's own note when the learner arrives, and nothing at a step without one", async () => {
    await notesService.arrive(at("01"));
    await type("first");
    notesService.setKind("question");
    await vi.advanceTimersByTimeAsync(NOTE_SAVE_DELAY_MS);
    await notesService.arrive(at("02"));
    expect(notesService.body.value).toBe("");
    expect(notesService.kind.value).toBe("note");
    await notesService.arrive(at("01"));
    expect(notesService.body.value).toBe("first");
    expect(notesService.kind.value).toBe("question");
  });

  it("keeps a note once typing settles, not on every key", async () => {
    await notesService.arrive(at("01"), { labTitle: "Lab One", stepTitle: "Setup" });
    notesService.edit("f");
    notesService.edit("fi");
    expect(notesService.saveState.value).toBe("pending");
    await vi.advanceTimersByTimeAsync(NOTE_SAVE_DELAY_MS - 1);
    expect(store.notes.size).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    const [kept] = store.notes.values();
    expect(kept).toMatchObject({ body: "fi", labTitle: "Lab One", stepTitle: "Setup" });
    expect(notesService.saveState.value).toBe("saved");
    expect(notesService.noted.value).toEqual(["01"]);
  });

  it("keeps a note still settling when the learner moves to another step", async () => {
    await notesService.arrive(at("01"));
    notesService.edit("half typed");
    await notesService.arrive(at("02"));
    expect((await store.get(at("01")))?.body).toBe("half typed");
    expect(notesService.noted.value).toEqual(["01"]);
  });

  it("forgets a note the learner empties", async () => {
    await notesService.arrive(at("01"));
    await type("x");
    await type("   ");
    expect(store.notes.size).toBe(0);
    expect(notesService.noted.value).toEqual([]);
  });

  it("ignores a kind that is not one, and saves a new kind only for a note with words", async () => {
    await notesService.arrive(at("01"));
    notesService.setKind("rant");
    expect(notesService.kind.value).toBe("note");
    notesService.setKind("discovery");
    await vi.advanceTimersByTimeAsync(NOTE_SAVE_DELAY_MS);
    expect(store.notes.size).toBe(0);
  });

  it("does nothing with typing before the learner reaches a step", async () => {
    notesService.edit("lost");
    await vi.advanceTimersByTimeAsync(NOTE_SAVE_DELAY_MS);
    await notesService.flush();
    expect(store.notes.size).toBe(0);
  });

  it("lists only this lab's steps with notes", async () => {
    await notesService.arrive(at("01", "/lab/cs101/lab-02"));
    await type("other lab");
    await notesService.arrive(at("03"));
    await type("here");
    expect(notesService.noted.value).toEqual(["03"]);
  });

  it("drops a slower arrival overtaken by a newer one", async () => {
    await store.put({ ref: at("01"), body: "one", kind: "note", updatedAt: "2026-01-05T09:00:00.000Z" });
    const first = notesService.arrive(at("01"));
    const second = notesService.arrive(at("02"));
    await Promise.all([first, second]);
    expect(notesService.step.value).toEqual(at("02"));
    expect(notesService.body.value).toBe("");
  });

  it("keeps later typing on the newest step when arrivals overlap a slow save", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = Object.assign(Object.create(store), {
      put: async (note: Parameters<InMemoryNotesStore["put"]>[0]) => {
        await gate;
        return store.put(note);
      }
    }) as InMemoryNotesStore;
    notesService.configure({ store: slow, now });
    await notesService.arrive(at("01"));
    notesService.edit("typed on one");
    const toTwo = notesService.arrive(at("02"));
    const toThree = notesService.arrive(at("03"));
    release();
    await Promise.all([toTwo, toThree]);
    expect(notesService.step.value).toEqual(at("03"));
    await type("typed on three");
    expect((await store.get(at("01")))?.body).toBe("typed on one");
    expect((await store.get(at("03")))?.body).toBe("typed on three");
    expect(await store.get(at("02"))).toBeNull();
  });

  it("writes a settling note at once when flushed, as a page that is going away does", async () => {
    await notesService.arrive(at("01"));
    notesService.edit("last words");
    void notesService.flush();
    expect(store.notes.size).toBe(1);
  });
});

describe("notesService: the panel", () => {
  it("opens, minimises and closes, keeping its state in the browser", async () => {
    notesService.open();
    expect(notesService.panel.value).toMatchObject({ open: true, minimised: false });
    notesService.minimise();
    expect(notesService.panel.value).toMatchObject({ open: true, minimised: true });
    expect(JSON.parse(items.get(NOTES_PANEL_KEY)!)).toMatchObject({ open: true, minimised: true });
    notesService.close();
    expect(notesService.panel.value).toMatchObject({ open: false, minimised: false });
  });

  it("keeps the width between its limits", () => {
    notesService.setWidth(5000);
    expect(notesService.panel.value.width).toBe(NOTES_PANEL_MAX_WIDTH);
    notesService.setWidth(10);
    expect(notesService.panel.value.width).toBe(NOTES_PANEL_MIN_WIDTH);
    notesService.setWidth(400.4);
    expect(notesService.panel.value.width).toBe(400);
  });

  it("comes back as the learner left it, and keeps it while they move between steps (Rule 0381)", async () => {
    notesService.open();
    notesService.setWidth(420);
    notesService.reset();
    notesService.restorePanel();
    expect(notesService.panel.value).toEqual({ open: true, minimised: false, width: 420 });
    await notesService.arrive(at("01"));
    await notesService.arrive(at("02", "/lab/cs101/lab-02"));
    expect(notesService.panel.value).toEqual({ open: true, minimised: false, width: 420 });
  });

  it("opens closed when what the browser kept is missing, broken or odd", () => {
    expect(readPanelState()).toEqual({ open: false, minimised: false, width: 360 });
    items.set(NOTES_PANEL_KEY, "{broken");
    expect(readPanelState()).toEqual({ open: false, minimised: false, width: 360 });
    items.set(NOTES_PANEL_KEY, "7");
    expect(readPanelState()).toEqual({ open: false, minimised: false, width: 360 });
    items.set(NOTES_PANEL_KEY, JSON.stringify({ open: "yes", minimised: true, width: "wide" }));
    expect(readPanelState()).toEqual({ open: false, minimised: true, width: 360 });
  });

  it("still works on the page when the browser will not keep its state", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      }
    });
    notesService.open();
    expect(notesService.panel.value.open).toBe(true);
    expect(readPanelState().open).toBe(false);
  });
});

describe("notesService: exports and deleting", () => {
  beforeEach(async () => {
    await notesService.arrive(at("01"), { labTitle: "Lab One", stepTitle: "Setup" });
    await type("first thoughts");
    await notesService.arrive(at("01", "/lab/cs101/lab-02"), { labTitle: "Lab Two", stepTitle: "Routes" });
    notesService.edit("second lab");
  });

  it("exports the whole course, keeping a note still settling", async () => {
    const doc = await notesService.exportCourse(target);
    expect(doc.split("\n")[0]).toBe("# Web Development notes");
    expect(doc).toContain("## Lab One");
    expect(doc).toContain("## Lab Two");
    expect(doc).toContain("second lab");
  });

  it("exports one lab", async () => {
    const doc = await notesService.exportLab(target, LAB);
    expect(doc).toContain("first thoughts");
    expect(doc).not.toContain("second lab");
  });

  it("deletes every note of the course and leaves other courses' notes", async () => {
    await store.put({ ref: at("01", "/lab/cs102/lab-01", "cs102"), body: "keep me", kind: "note", updatedAt: "2026-01-05T09:00:00.000Z" });
    await notesService.deleteCourse("cs101");
    expect(await store.forCourse("cs101")).toEqual([]);
    expect(await store.forCourse("cs102")).toHaveLength(1);
    expect(notesService.body.value).toBe("");
    expect(notesService.noted.value).toEqual([]);
  });

  it("deleting another course's notes leaves the note on screen", async () => {
    await notesService.deleteCourse("cs102");
    expect(notesService.body.value).toBe("second lab");
  });
});

describe("notesService: when the browser refuses notes (Rule 0383)", () => {
  it("has nothing to warn about while the browser keeps notes", () => {
    expect(notesService.takeSessionOnlyWarning()).toBe(false);
  });

  it("keeps the session's notes in memory and says so once", async () => {
    store.failing = true;
    await notesService.arrive(at("01"));
    expect(notesService.sessionOnly.value).toBe(true);
    await type("first");
    await notesService.arrive(at("02"));
    await type("second");
    expect(notesService.noted.value).toEqual(["01", "02"]);
    expect(notesService.takeSessionOnlyWarning()).toBe(true);
    expect(notesService.takeSessionOnlyWarning()).toBe(false);
    const doc = await notesService.exportCourse(target);
    expect(doc).toContain("first");
    expect(doc).toContain("second");
  });

  it("wraps a newly configured store afresh", async () => {
    store.failing = true;
    await notesService.arrive(at("01"));
    const fresh = new InMemoryNotesStore();
    notesService.configure({ store: fresh, now });
    await type("into the new store");
    expect((await fresh.get(at("01")))?.body).toBe("into the new store");
  });
});
