/**
 * A learner's private notes, one per lab step. They stay in the learner's browser and are never sent
 * to a server (Rule 0380); the learner may export a course's notes as one markdown document
 * (Rule 0382). Everything here is plain TypeScript over a NotesStore, so it runs the same in the
 * reader and in tests.
 */

/** The lab step a note is about: the course, the lab's route and the step's id. */
export type StepRef = {
  readonly courseId: string;
  /** The lab's route in the reader, for example `/lab/cs101/lab-01`. */
  readonly labRoute: string;
  /** The step's id within the lab, for example `02`. */
  readonly stepId: string;
};

const part = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The reference to a step, or null when any of its three parts is missing or blank. */
export function stepRef(courseId: unknown, labRoute: unknown, stepId: unknown): StepRef | null {
  const c = part(courseId);
  const l = part(labRoute);
  const s = part(stepId);
  return c && l && s ? { courseId: c, labRoute: l, stepId: s } : null;
}

/** True when `value` is a step reference with all three parts present. */
export function isStepRef(value: unknown): value is StepRef {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return stepRef(v.courseId, v.labRoute, v.stepId) !== null;
}

export function sameStep(a: StepRef, b: StepRef): boolean {
  return a.courseId === b.courseId && a.labRoute === b.labRoute && a.stepId === b.stepId;
}

/** One string per step, for maps; distinct steps always give distinct strings, whatever their parts hold. */
export function stepKey(ref: StepRef): string {
  return JSON.stringify([ref.courseId, ref.labRoute, ref.stepId]);
}

/** `s` without the slashes at its start and end; a loop, so no input makes it slow. */
function trimSlashes(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === "/") start++;
  while (end > start && s[end - 1] === "/") end--;
  return s.slice(start, end);
}

export const NOTE_KINDS = ["note", "discovery", "question", "snippet", "reflection"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export type Note = {
  ref: StepRef;
  body: string;
  kind: NoteKind;
  /** When the learner last changed it, as an ISO instant. */
  updatedAt: string;
  /** Titles as the learner saw them, so an export reads well without the course loaded. */
  labTitle?: string;
  stepTitle?: string;
};

export function isNoteKind(value: unknown): value is NoteKind {
  return typeof value === "string" && (NOTE_KINDS as readonly string[]).includes(value);
}

/** Where a step's note is kept in browser storage: `@notes/{courseId}/{labRoute}/{stepId}`. */
export function noteKey(ref: StepRef): string {
  return `@notes/${trimSlashes(ref.courseId)}/${trimSlashes(ref.labRoute)}/${trimSlashes(ref.stepId)}`;
}

/** Where a learner's notes are kept. The reader keeps them in the browser's localStorage. */
export interface NotesStore {
  /** The step's note, or null. */
  get(ref: StepRef): Promise<Note | null>;
  /** Keeps the note under its step, replacing the one there; rejects when storage refused it. */
  put(note: Note): Promise<void>;
  /** Forgets the step's note. */
  remove(ref: StepRef): Promise<void>;
  /** Every note of a course, in no particular order. */
  forCourse(courseId: string): Promise<Note[]>;
}

/** The notes panel's own state, which moving between steps keeps (Rule 0381). */
export type NotesPanelState = { open: boolean; minimised: boolean; width: number };

export const DEFAULT_NOTES_PANEL: NotesPanelState = { open: false, minimised: false, width: 360 };

/** What the panel shows at a step: its own state, unchanged, and that step's note or none. */
export type NotesPanelView = NotesPanelState & { ref: StepRef; note: Note | null };

export type NoteInput = { ref: StepRef; body: string; kind?: NoteKind; labTitle?: string; stepTitle?: string };

/**
 * Keeps the learner's note for a step, stamped `now`; an emptied note is forgotten. The store's
 * refusal (storage unavailable or full) reaches the caller.
 * @returns the note kept, or null when it was emptied
 */
export async function saveNote(notes: NotesStore, input: NoteInput, now: Date = new Date()): Promise<Note | null> {
  if (!input.body.trim()) {
    await notes.remove(input.ref);
    return null;
  }
  const note: Note = {
    ref: input.ref,
    body: input.body,
    kind: isNoteKind(input.kind) ? input.kind : "note",
    updatedAt: now.toISOString(),
    ...(input.labTitle ? { labTitle: input.labTitle } : {}),
    ...(input.stepTitle ? { stepTitle: input.stepTitle } : {})
  };
  await notes.put(note);
  return note;
}

/** The notes panel at the step the learner arrived at: its state as it was, with that step's own note (Rule 0381). */
export async function openStepNotes(notes: NotesStore, panel: NotesPanelState, ref: StepRef): Promise<NotesPanelView> {
  return { open: panel.open, minimised: panel.minimised, width: panel.width, ref, note: await notes.get(ref) };
}

const day = (iso: string) => iso.slice(0, 10);

/**
 * Notes as one markdown document: a heading per lab, a sub-heading per step linking to the reader,
 * then each note's kind, date and body (Rule 0382). Labs and steps are ordered by route and id so
 * the same notes always export the same document. Empty notes are left out.
 */
export function notesToMarkdown(courseTitle: string, notes: readonly Note[], readerUrl: (ref: StepRef) => string): string {
  const kept = notes.filter((n) => n.body.trim());
  const labs = new Map<string, Note[]>();
  for (const note of [...kept].sort((a, b) => a.ref.labRoute.localeCompare(b.ref.labRoute) || a.ref.stepId.localeCompare(b.ref.stepId, undefined, { numeric: true }))) {
    const lab = labs.get(note.ref.labRoute) ?? [];
    lab.push(note);
    labs.set(note.ref.labRoute, lab);
  }
  const lines = [`# ${courseTitle} notes`, ""];
  for (const [labRoute, labNotes] of labs) {
    lines.push(`## ${labNotes.find((n) => n.labTitle)?.labTitle ?? labRoute}`, "");
    for (const note of labNotes) {
      lines.push(`### [${note.stepTitle ?? note.ref.stepId}](${readerUrl(note.ref)})`, "", `_${note.kind} · ${day(note.updatedAt)}_`, "", note.body.trimEnd(), "");
    }
  }
  return lines.join("\n");
}

export type ExportCourse = { courseId: string; title: string; readerUrl: (ref: StepRef) => string };

/** A course's notes as one markdown document, built in the browser (Rule 0382). */
export async function exportNotes(notes: NotesStore, course: ExportCourse): Promise<string> {
  return notesToMarkdown(course.title, await notes.forCourse(course.courseId), course.readerUrl);
}

/**
 * NotesStore that keeps working when the store under it cannot: the first refused write moves the
 * session's notes into memory and calls `warn` once, so the learner is told once that notes will
 * not persist and can still read and export them (Rule 0383). Notes the store already held stay
 * readable under the ones kept in memory.
 */
export function withMemoryFallback(store: NotesStore, warn: () => void): NotesStore & { readonly inMemory: boolean } {
  const memory = new Map<string, Note>();
  const removed = new Set<string>();
  let inMemory = false;
  const fallBack = () => {
    if (!inMemory) {
      inMemory = true;
      warn();
    }
  };
  const fromStore = async <T>(read: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return await read();
    } catch {
      fallBack();
      return empty;
    }
  };
  return {
    get inMemory() {
      return inMemory;
    },
    async get(ref) {
      const key = stepKey(ref);
      if (memory.has(key)) return memory.get(key)!;
      if (removed.has(key)) return null;
      return fromStore(() => store.get(ref), null);
    },
    async put(note) {
      const key = stepKey(note.ref);
      removed.delete(key);
      if (!inMemory) {
        try {
          await store.put(note);
          return;
        } catch {
          fallBack();
        }
      }
      memory.set(key, note);
    },
    async remove(ref) {
      const key = stepKey(ref);
      memory.delete(key);
      removed.add(key);
      // Removing frees space, so it is tried even after a full store moved notes into memory:
      // a note the learner deleted must not come back on the next page load.
      await store.remove(ref).catch(fallBack);
    },
    async forCourse(courseId) {
      const stored = await fromStore(() => store.forCourse(courseId), [] as Note[]);
      const byKey = new Map(stored.map((n) => [stepKey(n.ref), n]));
      for (const key of removed) byKey.delete(key);
      for (const [key, note] of memory) if (note.ref.courseId === courseId) byKey.set(key, note);
      return [...byKey.values()];
    }
  };
}
