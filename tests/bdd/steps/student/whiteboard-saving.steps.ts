import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { recorder } from "../../support/supabase-recorder.ts";
import { mountWhiteboardEditor } from "../../support/whiteboard-editor.ts";
import { loadWhiteboardScene, SAVED_STATUS, saveWhiteboardScene } from "../../../../packages/svelte/ui-components/src/learning-objects/content/whiteboard/whiteboard-scene.ts";

const feature = await loadFeature("tests/bdd/features/student/whiteboard-saving.feature");

// The room ids WhiteboardViewer derives for a whiteboard's personal and shared copies.
const PERSONAL = "wb-web-dev-101-topic-01-whiteboard-design-alice";
const SHARED = "wb-web-dev-101-topic-01-whiteboard-design";

type Element = { id: string; version: number; type: string; fileId?: string };
type Scene = { elements: Element[]; appState?: unknown; files?: Record<string, unknown> };
type Db = Parameters<typeof saveWhiteboardScene>[0];

// An Excalidraw BinaryFileData entry; its bytes are derived from its id so a test can tell two apart.
const file = (id: string, dataURL = `data:image/png;base64,${Buffer.from(`png-bytes-of-${id}`).toString("base64")}`) => ({
  id,
  mimeType: "image/png",
  dataURL,
  created: 1
});
const imageElement = (fileId: string, version = 1): Element => ({ id: `image-${fileId}`, version, type: "image", fileId });
const shape = (version = 1): Element => ({ id: "shape-1", version, type: "rectangle" });

/**
 * The store as one save sees it while another save lands: `between` runs once, after this save's first
 * database request has been answered and before that answer reaches it. A save that reads and then writes
 * in two requests is overwritten with what it read; a save that is one request has already been written.
 */
function interleaved(between: () => Promise<unknown>): Db {
  let landed = false;
  const wrap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(t, key) {
        const value = Reflect.get(t, key);
        if (key === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            (value as PromiseLike<unknown>["then"])
              .call(t, async (answer: unknown) => {
                if (!landed) {
                  landed = true;
                  await between();
                }
                return answer;
              })
              .then(resolve, reject);
        }
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          const result = value.apply(t, args);
          return typeof result === "object" && result !== null ? wrap(result) : result;
        };
      }
    });
  return wrap(recorder) as unknown as Db;
}

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  const db = recorder as unknown as Db;
  let editor: ReturnType<typeof mountWhiteboardEditor> | undefined;
  let room = PERSONAL;
  let opened: Scene | null = null;
  // What Excalidraw holds: the elements and the file map it hands onChange.
  let canvas: { elements: Element[]; files: Record<string, unknown> } = { elements: [], files: {} };
  let sent: Scene | undefined;
  let status = "";
  let seeded: Record<string, unknown> | undefined;

  const stored = (roomId: string) => recorder.rows("whiteboard_scenes").find((row) => row.room_id === roomId) as Record<string, any> | undefined;
  const seedBoard = (roomId: string, fileId: string) => {
    seeded = {
      room_id: roomId,
      elements: [shape(), imageElement(fileId)],
      app_state: { viewBackgroundColor: "#ffffff" },
      files: { [fileId]: file(fileId) },
      updated_at: "2026-10-19T09:00:00Z"
    };
    recorder.seed("whiteboard_scenes", [structuredClone(seeded)]);
  };
  const open = async (roomId: string) => {
    room = roomId;
    opened = await loadWhiteboardScene(db, roomId);
    editor = mountWhiteboardEditor({ roomId, initialScene: opened ?? undefined });
    editor.status("SUBSCRIBED");
    editor.participants(1);
    canvas = { elements: structuredClone(opened?.elements ?? []), files: { ...(opened?.files ?? {}) } };
  };
  // Excalidraw calls onChange with the scene's elements, app state and file map; the editor batches for 250 ms.
  const editorSends = () => {
    editor!.editor.onChange(canvas.elements, { viewBackgroundColor: "#ffffff" }, canvas.files);
    vi.advanceTimersByTime(250);
    const posted = editor!.postMessage.mock.calls.filter(([message]) => message.type === "scene-changed");
    sent = posted.at(-1)?.[0];
  };
  const moveShape = () => {
    canvas.elements = canvas.elements.map((el) => (el.id === "shape-1" ? { ...el, version: el.version + 1, x: el.version * 10 } : el));
    editorSends();
  };
  const addImage = (_ctx: unknown, fileId: string) => {
    canvas.elements = [...canvas.elements, imageElement(fileId)];
    canvas.files = { ...canvas.files, [fileId]: file(fileId) };
    editorSends();
  };
  const save = async () => {
    expect(sent, "the editor sent a scene to the parent").toBeDefined();
    status = await saveWhiteboardScene(db, room, sent!, opened?.files);
  };
  const holdsImage = (roomId: string) => (_ctx: unknown, fileId: string) => {
    const row = stored(roomId)!;
    expect(row.elements.some((el: Element) => el.fileId === fileId)).toBe(true);
    expect(row.files[fileId]).toEqual(file(fileId));
  };
  const holdsImages = (roomId: string) => (_ctx: unknown, ids: string) => {
    for (const fileId of ids.split(", ")) holdsImage(roomId)(_ctx, fileId);
  };
  const reports = (_ctx: unknown, text: string) => expect(status).toBe(text);
  const unchanged = (_ctx: unknown, fileId: string) => {
    expect(stored(PERSONAL)).toEqual(seeded);
    expect(Object.keys(stored(PERSONAL)!.files)).toEqual([fileId]);
  };

  AfterEachScenario(() => {
    editor?.unmount();
    editor = undefined;
    opened = null;
    sent = undefined;
    status = "";
    recorder.reset();
    vi.useRealTimers();
  });

  Background(({ Given }) => {
    Given("a whiteboard store that accepts writes", () => {
      recorder.reset();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: new Date("2026-10-19T10:00:00Z") });
    });
  });

  Rule("When a whiteboard scene is saved, the reader shall store every image file the scene's elements reference with the scene.", ({ RuleScenario }) => {
    RuleScenario("Editing a personal board keeps its existing image", ({ Given, When, And, Then }) => {
      Given("the personal board holds a shape and the image {string}", (_ctx, fileId: string) => seedBoard(PERSONAL, fileId));
      When("the student opens the personal board in the editor", () => open(PERSONAL));
      And("the student moves the shape and the editor sends the scene", moveShape);
      And("the scene is saved", save);
      Then("the stored personal board holds the image {string} with its original bytes", holdsImage(PERSONAL));
      And("reopening the personal board gives the editor the image {string}", async (_ctx, fileId: string) => {
        editor!.unmount();
        await open(PERSONAL);
        expect(editor!.editor.initialData.files[fileId]).toEqual(file(fileId));
        expect(editor!.editor.initialData.elements.some((el: Element) => el.fileId === fileId)).toBe(true);
      });
    });
    RuleScenario("An image whose file arrives after its element is saved", ({ Given, When, And, Then }) => {
      Given("the shared board is empty", () => expect(stored(SHARED)).toBeUndefined());
      When("the student opens the shared board in the editor", () => open(SHARED));
      And("the student adds the image {string} before its file has loaded", (_ctx, fileId: string) => {
        canvas.elements = [...canvas.elements, imageElement(fileId)];
        editorSends();
      });
      And("the image file {string} loads without changing any element", (_ctx, fileId: string) => {
        canvas.files = { ...canvas.files, [fileId]: file(fileId) };
        editorSends();
      });
      And("the scene is saved", save);
      Then("the stored shared board holds the image {string} with its original bytes", holdsImage(SHARED));
    });
    RuleScenario("Adding a second image keeps the first through repeated saves", ({ Given, When, And, Then }) => {
      Given("the shared board holds a shape and the image {string}", (_ctx, fileId: string) => seedBoard(SHARED, fileId));
      When("the student opens the shared board in the editor", () => open(SHARED));
      And("the student adds the image {string} and the editor sends the scene", addImage);
      And("the scene is saved", save);
      And("the student moves the shape and the editor sends the scene", moveShape);
      And("the scene is saved again", save);
      Then("the stored shared board holds the images {string} with their original bytes", holdsImages(SHARED));
    });
    RuleScenario("A peer without the image file does not erase it", ({ Given, When, Then }) => {
      Given("the shared board holds a shape and the image {string}", (_ctx, fileId: string) => seedBoard(SHARED, fileId));
      When("a peer whose editor never loaded {string} moves the shape and the scene is saved", async (_ctx, fileId: string) => {
        // The peer joined before the board was saved, and broadcasts carry elements only.
        room = SHARED;
        editor = mountWhiteboardEditor({ roomId: SHARED });
        editor.status("SUBSCRIBED");
        editor.participants(1);
        canvas = { elements: [shape(2), imageElement(fileId)], files: {} };
        editorSends();
        await save();
      });
      Then("the stored shared board holds the image {string} with its original bytes", holdsImage(SHARED));
    });
    RuleScenario("A save that references an image it did not send keeps the bytes another save stored in between", ({ Given, When, And, Then }) => {
      let peerSave: ((between: () => Promise<unknown>) => Promise<string>) | undefined;
      Given("the shared board is empty", () => expect(stored(SHARED)).toBeUndefined());
      When("a peer whose editor has the image {string} but not its file starts saving the scene", (_ctx, fileId: string) => {
        // A broadcast gave the peer the element; the bytes are only in the student's editor and the store.
        peerSave = (between) => saveWhiteboardScene(interleaved(between), SHARED, { elements: [shape(), imageElement(fileId)], files: {} });
      });
      And("the student's save of the image {string} with its file lands before the peer's save finishes", async (_ctx, fileId: string) => {
        const studentSave = () => saveWhiteboardScene(db, SHARED, { elements: [shape(), imageElement(fileId)], files: { [fileId]: file(fileId) } });
        expect(await peerSave!(studentSave)).toBe(SAVED_STATUS);
      });
      Then("the stored shared board holds the image {string} with its original bytes", holdsImage(SHARED));
    });
  });

  Rule(
    "If a whiteboard scene is malformed or larger than 4 MiB, then the reader shall keep the last saved scene and report that the changes were not saved.",
    ({ RuleScenario }) => {
      RuleScenario("An oversize scene is not written", ({ Given, When, And, Then }) => {
        Given("the personal board holds a shape and the image {string}", (_ctx, fileId: string) => seedBoard(PERSONAL, fileId));
        When("the student opens the personal board in the editor", () => open(PERSONAL));
        And("the student adds a {number} MiB image {string} and the editor sends the scene", (_ctx, mib: number, fileId: string) => {
          canvas.elements = [...canvas.elements, imageElement(fileId)];
          canvas.files = { ...canvas.files, [fileId]: file(fileId, `data:image/png;base64,${"A".repeat(mib * 1024 * 1024)}`) };
          editorSends();
        });
        And("the scene is saved", save);
        Then("the save reports {string}", reports);
        And("the stored personal board still holds only the image {string}", unchanged);
      });
      RuleScenario("A malformed image file is not written", ({ Given, When, And, Then }) => {
        Given("the personal board holds a shape and the image {string}", (_ctx, fileId: string) => seedBoard(PERSONAL, fileId));
        When("the editor sends a scene whose image file {string} has no data", async (_ctx, fileId: string) => {
          await open(PERSONAL);
          canvas.elements = [...canvas.elements, imageElement(fileId)];
          canvas.files = { ...canvas.files, [fileId]: { id: fileId, mimeType: "image/png" } };
          editorSends();
        });
        And("the scene is saved", save);
        Then("the save reports {string}", reports);
        And("the stored personal board still holds only the image {string}", unchanged);
      });
    }
  );
});
