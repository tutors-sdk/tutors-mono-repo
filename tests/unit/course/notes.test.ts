/**
 * The notes module's plain parts: naming a step, the markdown export's order and shape, and the
 * memory fallback when the store under it refuses (Rules 0380, 0382 and 0383).
 */
import { describe, expect, it } from "vitest";
import {
  isNoteKind,
  isStepRef,
  noteKey,
  notesToMarkdown,
  sameStep,
  saveNote,
  stepRef,
  withMemoryFallback,
  type Note,
  type NotesStore,
  type StepRef
} from "../../../packages/svelte/course/src/notes/notes.ts";

const ref = (stepId: string, labRoute = "/lab/cs101/lab-01", courseId = "cs101"): StepRef => ({ courseId, labRoute, stepId });
const note = (stepId: string, body: string, extra: Partial<Note> = {}): Note => ({ ref: ref(stepId), body, kind: "note", updatedAt: "2026-01-05T09:00:00.000Z", ...extra });
const url = (r: StepRef) => `https://reader.example${r.labRoute}/${r.stepId}`;

describe("a step reference", () => {
  it("needs all three parts, trimmed", () => {
    expect(stepRef(" cs101 ", "/lab/cs101/lab-01", "02")).toEqual(ref("02"));
    expect(stepRef("cs101", "", "02")).toBeNull();
    expect(stepRef("cs101", "/lab", 2)).toBeNull();
    expect(isStepRef(ref("02"))).toBe(true);
    expect(isStepRef({ courseId: "cs101" })).toBe(false);
    expect(isStepRef(null)).toBe(false);
    expect(isStepRef("cs101")).toBe(false);
  });

  it("compares by its parts", () => {
    expect(sameStep(ref("02"), ref("02"))).toBe(true);
    expect(sameStep(ref("02"), ref("02", "/lab/cs101/lab-02"))).toBe(false);
  });

  it("keys a note without doubled slashes", () => {
    expect(noteKey({ courseId: "/cs101/", labRoute: "//lab/cs101/lab-01/", stepId: "02/" })).toBe("@notes/cs101/lab/cs101/lab-01/02");
  });

  it("knows the kinds of note", () => {
    expect(isNoteKind("question")).toBe(true);
    expect(isNoteKind("rant")).toBe(false);
    expect(isNoteKind(3)).toBe(false);
  });
});

describe("the markdown export", () => {
  it("orders labs by route and steps by number, leaves out empty notes and falls back to ids", () => {
    const doc = notesToMarkdown(
      "Web",
      [
        note("10", "ten", { labTitle: "Lab One", stepTitle: "Ten" }),
        note("2", "two"),
        note("3", "   "),
        { ...note("1", "other lab", { kind: "question" }), ref: ref("1", "/lab/cs101/lab-00") }
      ],
      url
    );
    const headings = doc.split("\n").filter((l) => l.startsWith("#"));
    expect(headings).toEqual(["# Web notes", "## /lab/cs101/lab-00", "### [1](https://reader.example/lab/cs101/lab-00/1)", "## Lab One", "### [2](https://reader.example/lab/cs101/lab-01/2)", "### [Ten](https://reader.example/lab/cs101/lab-01/10)"]);
    expect(doc).toContain("_question · 2026-01-05_");
  });
});

describe("saving a note", () => {
  it("stamps it, keeps its titles and treats an unknown kind as a note", async () => {
    const kept: Note[] = [];
    const store = { put: async (n: Note) => void kept.push(n) } as unknown as NotesStore;
    const saved = await saveNote(store, { ref: ref("02"), body: "x", kind: "rant" as never, labTitle: "Lab", stepTitle: "Step" }, new Date("2026-02-01T00:00:00Z"));
    expect(saved).toEqual({ ref: ref("02"), body: "x", kind: "note", updatedAt: "2026-02-01T00:00:00.000Z", labTitle: "Lab", stepTitle: "Step" });
    expect(kept).toEqual([saved]);
  });
});

describe("the memory fallback", () => {
  const refusing = (): NotesStore => ({
    get: () => Promise.reject(new Error("no")),
    put: () => Promise.reject(new Error("no")),
    remove: () => Promise.reject(new Error("no")),
    forCourse: () => Promise.reject(new Error("no"))
  });

  it("warns once and serves reads from memory when the store refuses reads", async () => {
    let warned = 0;
    const store = withMemoryFallback(refusing(), () => warned++);
    expect(await store.get(ref("01"))).toBeNull();
    expect(await store.forCourse("cs101")).toEqual([]);
    expect(store.inMemory).toBe(true);
    await store.put(note("01", "kept"));
    expect((await store.get(ref("01")))?.body).toBe("kept");
    expect(warned).toBe(1);
  });

  it("forgets a removed note even when the store refuses to", async () => {
    const store = withMemoryFallback(refusing(), () => {});
    await store.put(note("01", "kept"));
    await store.remove(ref("01"));
    expect(await store.get(ref("01"))).toBeNull();
    expect(await store.forCourse("cs101")).toEqual([]);
  });

  it("still removes a note from the store after a full store moved the session into memory", async () => {
    const removed: string[] = [];
    const full: NotesStore = {
      get: async () => null,
      put: () => Promise.reject(new Error("full")),
      remove: async (r) => void removed.push(r.stepId),
      forCourse: async () => []
    };
    const store = withMemoryFallback(full, () => {});
    await store.put(note("02", "new"));
    expect(store.inMemory).toBe(true);
    await store.remove(ref("01"));
    expect(removed).toEqual(["01"]);
  });

  it("hides a removed note the store still lists, and lists only the course's notes from memory", async () => {
    const held = [note("01", "old"), note("02", "stays")];
    const flaky: NotesStore = {
      get: async () => null,
      put: () => Promise.reject(new Error("full")),
      remove: async () => {},
      forCourse: async () => held
    };
    const store = withMemoryFallback(flaky, () => {});
    await store.remove(ref("01"));
    await store.put({ ...note("09", "elsewhere"), ref: ref("09", "/lab/cs102/lab-01", "cs102") });
    expect((await store.forCourse("cs101")).map((n) => n.body)).toEqual(["stays"]);
  });
});
