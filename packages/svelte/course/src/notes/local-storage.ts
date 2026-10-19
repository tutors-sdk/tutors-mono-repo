/**
 * A learner's private notes in the browser's localStorage. Each note sits under its step's key,
 * `@notes/{courseId}/{labRoute}/{stepId}` (`noteKey`), as `{ ref, kind, body, updatedAt, labTitle?,
 * stepTitle? }`; nothing is sent to a server (Rule 0380). A write the browser refuses (no storage,
 * or storage full) rejects, so `withMemoryFallback` can keep the session's notes in memory instead
 * (Rule 0383).
 */
import { isNoteKind, isStepRef, noteKey, type Note, type NotesStore } from "./notes.ts";

/** The subset of Storage this store uses, so tests can pass a plain object. */
export type NotesStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "@notes/";

export class NotesStorageUnavailableError extends Error {
  constructor() {
    super("Browser storage is not available");
    this.name = "NotesStorageUnavailableError";
  }
}

function browserStorage(): NotesStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The stored value as a note, or null when it is not one (another app's key, a hand edit). */
function parseNote(raw: string | null): Note | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!isStepRef(v.ref) || typeof v.body !== "string" || typeof v.updatedAt !== "string") return null;
    const { courseId, labRoute, stepId } = v.ref;
    return {
      ref: { courseId, labRoute, stepId },
      body: v.body,
      kind: isNoteKind(v.kind) ? v.kind : "note",
      updatedAt: v.updatedAt,
      ...(typeof v.labTitle === "string" ? { labTitle: v.labTitle } : {}),
      ...(typeof v.stepTitle === "string" ? { stepTitle: v.stepTitle } : {})
    };
  } catch {
    return null;
  }
}

/** `storage` defaults to the browser's localStorage; where there is none, every call rejects. */
export function localStorageNotes(storage: () => NotesStorage | null = browserStorage): NotesStore {
  const store = (): NotesStorage => {
    const s = storage();
    if (!s) throw new NotesStorageUnavailableError();
    return s;
  };
  return {
    async get(ref) {
      return parseNote(store().getItem(noteKey(ref)));
    },
    async put(note) {
      store().setItem(noteKey(note.ref), JSON.stringify(note));
    },
    async remove(ref) {
      store().removeItem(noteKey(ref));
    },
    async forCourse(courseId) {
      const s = store();
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const key = s.key(i);
        if (key?.startsWith(PREFIX)) keys.push(key);
      }
      return keys.map((key) => parseNote(s.getItem(key))).filter((n): n is Note => !!n && n.ref.courseId === courseId);
    }
  };
}
