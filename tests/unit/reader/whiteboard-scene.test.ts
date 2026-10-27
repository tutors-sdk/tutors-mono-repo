import { beforeEach, describe, expect, it } from "vitest";
import { recorder } from "../../bdd/support/supabase-recorder";
import {
  FAILED_STATUS,
  loadWhiteboardScene,
  MAX_WHITEBOARD_SCENE_BYTES,
  SAVED_STATUS,
  saveWhiteboardScene,
  TOO_LARGE_STATUS
} from "../../../packages/svelte/ui-components/src/learning-objects/content/whiteboard/whiteboard-scene";

type Db = Parameters<typeof saveWhiteboardScene>[0];
const db = recorder as unknown as Db;
const ROOM = "wb-course-topic-board-alice";
const file = (id: string, dataURL = `data:image/png;base64,${id}`) => ({ id, mimeType: "image/png", dataURL });
const image = (fileId: string) => ({ id: `image-${fileId}`, version: 1, type: "image", fileId });
const saves = () => recorder.rpcCalls.filter((call) => call.fn === "save_whiteboard_scene");
const stored = () => recorder.rows("whiteboard_scenes").find((row) => row.room_id === ROOM) as { elements: unknown[]; files: Record<string, unknown> } | undefined;

describe("saveWhiteboardScene", () => {
  beforeEach(() => recorder.reset());

  it("round-trips the referenced files of a scene through the store", async () => {
    const scene = { elements: [image("a")], files: { a: file("a") } };
    expect(await saveWhiteboardScene(db, ROOM, scene)).toBe(SAVED_STATUS);
    expect(await loadWhiteboardScene(db, ROOM)).toMatchObject({ elements: scene.elements, files: scene.files });
  });

  it("keeps a stored or opened file the message omits, and drops files no element references", async () => {
    recorder.seed("whiteboard_scenes", [{ room_id: ROOM, elements: [image("a")], files: { a: file("a"), stale: file("stale") } }]);
    expect(await saveWhiteboardScene(db, ROOM, { elements: [image("a"), image("b")] }, { b: file("b") })).toBe(SAVED_STATUS);
    expect(stored()!.files).toEqual({ a: file("a"), b: file("b") });
  });

  it("saves in one database call, sending only the referenced files and never reading the stored row first", async () => {
    recorder.seed("whiteboard_scenes", [{ room_id: ROOM, elements: [image("a")], files: { a: file("a") } }]);
    await saveWhiteboardScene(db, ROOM, { elements: [image("a"), image("b")], files: { b: file("b"), c: file("c") } });
    expect(saves()).toEqual([{ fn: "save_whiteboard_scene", args: { p_room_id: ROOM, p_elements: [image("a"), image("b")], p_files: { b: file("b") } } }]);
    expect(recorder.tableCalls.filter((call) => call.table === "whiteboard_scenes")).toHaveLength(0);
  });

  it("reports too large when the stored files the database merges in take the scene over the limit", async () => {
    const half = "A".repeat(MAX_WHITEBOARD_SCENE_BYTES / 2 + 1);
    const seeded = { room_id: ROOM, elements: [image("a")], files: { a: file("a", `data:image/png;base64,${half}`) } };
    recorder.seed("whiteboard_scenes", [structuredClone(seeded)]);
    const scene = { elements: [image("a"), image("b")], files: { b: file("b", `data:image/png;base64,${half}`) } };
    expect(await saveWhiteboardScene(db, ROOM, scene)).toBe(TOO_LARGE_STATUS);
    expect(stored()).toEqual(seeded);
  });

  it("ignores a malformed stored file rather than writing it back", async () => {
    recorder.seed("whiteboard_scenes", [{ room_id: ROOM, elements: [], files: { a: { id: "a" } } }]);
    await saveWhiteboardScene(db, ROOM, { elements: [image("a")], files: {} });
    expect(stored()!.files).toEqual({});
  });

  it("refuses elements that are not an array of identified elements", async () => {
    expect(await saveWhiteboardScene(db, ROOM, { elements: "nope" })).toBe(FAILED_STATUS);
    expect(await saveWhiteboardScene(db, ROOM, { elements: [{ version: 1 }] })).toBe(FAILED_STATUS);
    expect(await saveWhiteboardScene(db, ROOM, { elements: [image("a")], files: { a: { ...file("a"), id: "b" } } })).toBe(FAILED_STATUS);
    expect(saves()).toHaveLength(0);
  });

  it("refuses a scene over the size limit without writing it", async () => {
    const big = file("a", `data:image/png;base64,${"A".repeat(MAX_WHITEBOARD_SCENE_BYTES)}`);
    expect(await saveWhiteboardScene(db, ROOM, { elements: [image("a")], files: { a: big } })).toBe(TOO_LARGE_STATUS);
    expect(saves()).toHaveLength(0);
  });

  it("reports failure and does not write when the database refuses the save", async () => {
    recorder.tableErrors.set("whiteboard_scenes", { message: "offline" });
    expect(await saveWhiteboardScene(db, ROOM, { elements: [image("a")], files: { a: file("a") } })).toBe(FAILED_STATUS);
    expect(stored()).toBeUndefined();
  });
});
