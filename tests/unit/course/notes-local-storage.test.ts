/**
 * The browser's notes store: a note per step, a course's own notes, what it does with storage it
 * did not write, a browser with no storage, and storage that is full (Rules 0380 and 0383).
 */
import { describe, expect, it } from "vitest";
import { localStorageNotes, NotesStorageUnavailableError, type NotesStorage } from "../../../packages/svelte/course/src/notes/local-storage.ts";
import type { Note, StepRef } from "../../../packages/svelte/course/src/notes/notes.ts";

function storage(seed: Record<string, string> = {}, full = false): NotesStorage & { items: Map<string, string> } {
  const items = new Map(Object.entries(seed));
  return {
    items,
    get length() {
      return items.size;
    },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      if (full) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      items.set(key, value);
    },
    removeItem: (key) => void items.delete(key)
  };
}

const ref: StepRef = { courseId: "cs101", labRoute: "/lab/cs101/lab-01", stepId: "02" };
const note: Note = { ref, body: "await the fetch", kind: "question", updatedAt: "2026-01-05T09:00:00.000Z", labTitle: "Lab One", stepTitle: "Fetching" };
const KEY = "@notes/cs101/lab/cs101/lab-01/02";

describe("localStorageNotes", () => {
  it("reads null for a step with no note, and nothing for a course with none", async () => {
    const notes = localStorageNotes(() => storage());
    expect(await notes.get(ref)).toBeNull();
    expect(await notes.forCourse("cs101")).toEqual([]);
  });

  it("keeps one note per step, the last write winning, and forgets a removed one", async () => {
    const s = storage();
    const notes = localStorageNotes(() => s);
    const other = { ...ref, stepId: "03" };
    await notes.put({ ...note, body: "first" });
    await notes.put({ ...note, body: "second" });
    await notes.put({ ...note, ref: other, body: "other" });
    expect((await notes.get(ref))?.body).toBe("second");
    await notes.remove(other);
    expect(await notes.get(other)).toBeNull();
    expect((await notes.forCourse("cs101")).map((n) => n.ref.stepId)).toEqual(["02"]);
  });

  it("keeps a note under its step's key, with its reference, kind and titles", async () => {
    const s = storage();
    await localStorageNotes(() => s).put(note);
    expect(JSON.parse(s.items.get(KEY)!)).toEqual(note);
    expect(await localStorageNotes(() => s).get(ref)).toEqual(note);
  });

  it("reads a note without titles, and an unknown kind as a plain note", async () => {
    const s = storage({ [KEY]: JSON.stringify({ ref, body: "x", kind: "rant", updatedAt: "2026-01-05T09:00:00.000Z" }) });
    expect(await localStorageNotes(() => s).get(ref)).toEqual({ ref, body: "x", kind: "note", updatedAt: "2026-01-05T09:00:00.000Z" });
  });

  it("ignores values that are not notes: the panel's state, broken JSON, missing fields", async () => {
    const s = storage({
      "@notes/panel": JSON.stringify({ open: true, minimised: false, width: 360 }),
      [KEY]: "{not json",
      "@notes/cs101/lab/cs101/lab-01/03": JSON.stringify({ ref: { courseId: "cs101" }, body: "x", updatedAt: "t" }),
      "@notes/cs101/lab/cs101/lab-01/04": JSON.stringify({ ref: { ...ref, stepId: "04" }, body: 4, updatedAt: "t" }),
      "@notes/cs101/lab/cs101/lab-01/05": "null",
      courseVisits: "[]"
    });
    const notes = localStorageNotes(() => s);
    expect(await notes.get(ref)).toBeNull();
    expect(await notes.forCourse("cs101")).toEqual([]);
  });

  it("lists only the course's own notes", async () => {
    const s = storage();
    const notes = localStorageNotes(() => s);
    await notes.put(note);
    await notes.put({ ...note, ref: { ...ref, courseId: "cs102" } });
    s.items.set("unrelated", "x");
    expect((await notes.forCourse("cs101")).map((n) => n.ref.courseId)).toEqual(["cs101"]);
  });

  it("rejects every call where the browser has no storage", async () => {
    const notes = localStorageNotes(() => null);
    await expect(notes.get(ref)).rejects.toBeInstanceOf(NotesStorageUnavailableError);
    await expect(notes.put(note)).rejects.toThrow("Browser storage is not available");
    await expect(notes.remove(ref)).rejects.toBeInstanceOf(NotesStorageUnavailableError);
    await expect(notes.forCourse("cs101")).rejects.toBeInstanceOf(NotesStorageUnavailableError);
  });

  it("rejects a write when storage is full, so the session can keep the note in memory", async () => {
    await expect(localStorageNotes(() => storage({}, true)).put(note)).rejects.toThrow(/quota/);
  });

  it("uses the browser's localStorage by default, and none where there is no browser", async () => {
    const s = storage();
    const g = globalThis as { localStorage?: unknown };
    const before = g.localStorage;
    try {
      g.localStorage = s;
      await localStorageNotes().put(note);
      expect(s.items.has(KEY)).toBe(true);
      delete g.localStorage;
      await expect(localStorageNotes().get(ref)).rejects.toBeInstanceOf(NotesStorageUnavailableError);
      Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("SecurityError"); } });
      await expect(localStorageNotes().get(ref)).rejects.toBeInstanceOf(NotesStorageUnavailableError);
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: before });
      if (before === undefined) delete g.localStorage;
    }
  });
});
