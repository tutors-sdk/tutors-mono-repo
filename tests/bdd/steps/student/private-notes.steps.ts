/**
 * Private notes on lab steps (Rules 0380 to 0383), driven through the notes module and the
 * reader's notes panel state over the browser's local storage, with a Storage the test holds.
 */
import "../../support/svelte-runes-shim.ts";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { afterEach, expect, vi } from "vitest";
import {
  exportNotes,
  noteKey,
  openStepNotes,
  saveNote,
  withMemoryFallback,
  type NotesPanelState,
  type NotesPanelView,
  type NotesStore,
  type StepRef
} from "../../../../packages/svelte/course/src/notes/notes.ts";
import { localStorageNotes, type NotesStorage } from "../../../../packages/svelte/course/src/notes/local-storage.ts";
import { notesService } from "../../../../packages/svelte/course/src/notes/notes.svelte.ts";

const feature = await loadFeature("tests/bdd/features/student/private-notes.feature");

const READER = "https://reader.example";
const NOW = new Date("2026-01-05T09:00:00.000Z");

/** A browser's Storage the test can read, and fill up: a full one refuses every write as browsers do. */
class TestStorage implements NotesStorage {
  readonly items = new Map<string, string>();
  full = false;
  get length() {
    return this.items.size;
  }
  key(i: number) {
    return [...this.items.keys()][i] ?? null;
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.full) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}
const readerUrl = (ref: StepRef) => `${READER}${ref.labRoute}/${ref.stepId}`;

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let labRoute: string;
  let browser: TestStorage;
  let store: NotesStore;
  let warnings: number;
  let view: NotesPanelView;
  let exported: string;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let typedAt: number;
  let sessionOnlyTold: number;

  const at = (stepId: string): StepRef => ({ courseId, labRoute, stepId });
  const write = (body: string, stepId: string) => saveNote(store, { ref: at(stepId), body, labTitle: "Lab One", stepTitle: `Step ${stepId}` }, NOW);

  // A step is a test of its own, so only the globals are undone after each; the panel's state is
  // put back at the start of every scenario, in the Background.
  afterEach(() => vi.unstubAllGlobals());

  /** The reader's notes panel over the browser's local storage. */
  const composeReaderNotes = () => {
    vi.useFakeTimers();
    notesService.reset();
    notesService.configure({ store: localStorageNotes(() => browser), now: () => NOW });
    sessionOnlyTold = 0;
  };
  const typeInPanel = async (_ctx: unknown, _learner: string, body: string, stepId: string) => {
    if (!vi.isFakeTimers()) composeReaderNotes();
    const before = notesService.sessionOnly.value;
    await notesService.arrive(at(stepId), { labTitle: "Lab One", stepTitle: `Step ${stepId}` });
    typedAt = Date.now();
    notesService.edit(body);
    await vi.advanceTimersByTimeAsync(1000);
    if (!before && notesService.sessionOnly.value) sessionOnlyTold++;
  };

  Background(({ Given }) => {
    Given("the lab {string} of the course {string} has the steps {string}", (_ctx, route: string, course: string) => {
      vi.useRealTimers();
      notesService.reset();
      browser = new TestStorage();
      labRoute = route;
      courseId = course;
      warnings = 0;
      store = withMemoryFallback(localStorageNotes(() => browser), () => warnings++);
    });
  });

  Rule(
    "When a learner edits the note of a lab step, tutors shall keep the note in the browser under the step's reference within 1 second and send nothing to a server.",
    ({ RuleScenario }) => {
      RuleScenario("A note is kept in the browser", ({ When, Then, And }) => {
        let editedAt: number;
        When("{string} writes {string} in the note of the step {string}", async (_ctx, _learner: string, body: string, stepId: string) => {
          fetchSpy = vi.fn();
          vi.stubGlobal("fetch", fetchSpy);
          editedAt = NOW.getTime();
          await write(body, stepId);
        });
        Then("the note shall be kept under {string} within 1 second", (_ctx, key: string) => {
          expect([...browser.items.keys()]).toEqual([key]);
          const kept = JSON.parse(browser.getItem(key)!);
          expect(noteKey(kept.ref)).toBe(key);
          expect(Date.parse(kept.updatedAt) - editedAt).toBeLessThanOrEqual(1000);
        });
        And("nothing shall have been sent to a server", () => {
          expect(fetchSpy).not.toHaveBeenCalled();
        });
      });
      RuleScenario("The notes panel keeps a typed note in the browser's local storage", ({ When, Then, And }) => {
        When("{string} types {string} in the notes panel at the step {string}", async (ctx, learner: string, body: string, stepId: string) => {
          fetchSpy = vi.fn();
          vi.stubGlobal("fetch", fetchSpy);
          composeReaderNotes();
          await typeInPanel(ctx, learner, body, stepId);
        });
        Then("the browser's local storage shall hold {string} under {string} within 1 second", (_ctx, body: string, key: string) => {
          const kept = JSON.parse(browser.getItem(key) ?? "null");
          expect(kept?.body).toBe(body);
          expect(kept?.ref).toEqual(at("02"));
          expect(Date.now() - typedAt).toBeLessThanOrEqual(1000);
          expect(notesService.saveState.value).toBe("saved");
        });
        And("nothing shall have been sent to a server", () => {
          expect(fetchSpy).not.toHaveBeenCalled();
        });
      });
    }
  );

  const twoNotes = async (_ctx: unknown, _learner: string, first: string, a: string, second: string, b: string) => {
    await write(first, a);
    await write(second, b);
  };

  Rule(
    "While a learner moves between steps and labs of a course, tutors shall show each step's own note in the notes panel and keep the panel's open, minimised and width state.",
    ({ RuleScenario }) => {
      const panelAt = async (_ctx: unknown, width: number, stepId: string) => {
        const panel: NotesPanelState = { open: true, minimised: false, width };
        view = await openStepNotes(store, panel, at(stepId));
      };
      const arrive = async (_ctx: unknown, _learner: string, stepId: string) => {
        view = await openStepNotes(store, { open: view.open, minimised: view.minimised, width: view.width }, at(stepId));
      };
      const shows = (_ctx: unknown, body: string) => expect(view.note?.body).toBe(body);
      const kept = (_ctx: unknown, width: number) => expect({ open: view.open, minimised: view.minimised, width: view.width }).toEqual({ open: true, minimised: false, width });
      RuleScenario("Moving to the next step swaps the note and keeps the panel", ({ Given, And, When, Then }) => {
        Given("{string} has the note {string} at the step {string} and {string} at the step {string}", twoNotes);
        And("the notes panel is open, not minimised and {number} pixels wide at the step {string}", panelAt);
        When("{string} moves to the step {string}", arrive);
        Then("the notes panel shall show {string}", shows);
        And("the notes panel shall still be open, not minimised and {number} pixels wide", kept);
      });
      RuleScenario("Staying on a step keeps its note and the panel", ({ Given, And, When, Then }) => {
        Given("{string} has the note {string} at the step {string} and {string} at the step {string}", twoNotes);
        And("the notes panel is open, not minimised and {number} pixels wide at the step {string}", panelAt);
        When("{string} stays on the step {string}", arrive);
        Then("the notes panel shall show {string}", shows);
        And("the notes panel shall still be open, not minimised and {number} pixels wide", kept);
      });
    }
  );

  const exportCourse = (title: string) => exportNotes(store, { courseId, title, readerUrl });

  Rule(
    "When a learner exports a course's notes, tutors shall produce one markdown document with a heading per lab, a sub-heading per step linking to the reader, and each note's body, kind and date.",
    ({ RuleScenario }) => {
      RuleScenario("A course's notes export as one document", ({ Given, When, Then, And }) => {
        Given("{string} has the note {string} at the step {string} and {string} at the step {string}", twoNotes);
        When("{string} exports the notes of the course titled {string}", async (_ctx, _learner: string, title: string) => {
          exported = await exportCourse(title);
        });
        Then("the document shall open with the heading {string}", (_ctx, heading: string) => {
          expect(exported.split("\n")[0]).toBe(heading);
        });
        And("the document shall have one lab heading {string}", (_ctx, heading: string) => {
          expect(exported.split("\n").filter((line) => line.startsWith("## "))).toEqual([heading]);
        });
        And("the document shall have the step heading {string} followed by {string} and {string}", (_ctx, heading: string, stamp: string, body: string) => {
          const lines = exported.split("\n");
          const i = lines.indexOf(heading);
          expect(i).toBeGreaterThan(0);
          expect(lines.slice(i + 1, i + 5).filter(Boolean)).toEqual([stamp, body]);
        });
      });
    }
  );

  Rule(
    "If browser storage is unavailable or full, then tutors shall keep the notes of the session in memory, tell the learner once that the notes are kept for this session only, and still export them.",
    ({ RuleScenario }) => {
      RuleScenario("Notes survive the session when storage refuses them", ({ Given, When, And, Then }) => {
        Given("browser storage refuses every write", () => {
          browser.full = true;
        });
        When("{string} writes {string} in the note of the step {string}", async (_ctx, _learner: string, body: string, stepId: string) => {
          await write(body, stepId);
        });
        And("{string} writes {string} in the note of the step {string}", async (_ctx, _learner: string, body: string, stepId: string) => {
          await write(body, stepId);
        });
        Then("tutors shall have told {string} once that the notes are kept for this session only", () => {
          expect(warnings).toBe(1);
        });
        And("the note of the step {string} shall read {string}", async (_ctx, stepId: string, body: string) => {
          expect((await store.get(at(stepId)))?.body).toBe(body);
        });
        And("the export of the course shall contain {string} and {string}", async (_ctx, a: string, b: string) => {
          const doc = await exportCourse("Web Development");
          expect(doc).toContain(a);
          expect(doc).toContain(b);
        });
      });
      RuleScenario("The notes panel keeps the session's notes when local storage is full", ({ Given, When, And, Then }) => {
        Given("the browser's local storage is full", () => {
          composeReaderNotes();
          browser.full = true;
        });
        When("{string} types {string} in the notes panel at the step {string}", typeInPanel);
        And("{string} types {string} in the notes panel at the step {string}", typeInPanel);
        Then("the notes panel shall have said once that the notes are kept for this session only", () => {
          expect(notesService.sessionOnly.value).toBe(true);
          expect(sessionOnlyTold).toBe(1);
          expect(browser.items.size).toBe(0);
        });
        And("the notes panel's export of the course shall contain {string} and {string}", async (_ctx, a: string, b: string) => {
          const doc = await notesService.exportCourse({ courseId, title: "Web Development", readerUrl });
          expect(doc).toContain(a);
          expect(doc).toContain(b);
        });
      });
    }
  );
});
