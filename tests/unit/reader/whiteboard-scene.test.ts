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

  it("ignores a malformed stored file rather than writing it back", async () => {
    recorder.seed("whiteboard_scenes", [{ room_id: ROOM, elements: [], files: { a: { id: "a" } } }]);
    await saveWhiteboardScene(db, ROOM, { elements: [image("a")], files: {} });
    expect(stored()!.files).toEqual({});
  });

  it("refuses elements that are not an array of identified elements", async () => {
    expect(await saveWhiteboardScene(db, ROOM, { elements: "nope" })).toBe(FAILED_STATUS);
    expect(await saveWhiteboardScene(db, ROOM, { elements: [{ version: 1 }] })).toBe(FAILED_STATUS);
    expect(await saveWhiteboardScene(db, ROOM, { elements: [image("a")], files: { a: { ...file("a"), id: "b" } } })).toBe(FAILED_STATUS);
    expect(recorder.upserts("whiteboard_scenes")).toHaveLength(0);
  });

  it("refuses a scene over the size limit without writing it", async () => {
    const big = file("a", `data:image/png;base64,${"A".repeat(MAX_WHITEBOARD_SCENE_BYTES)}`);
    expect(await saveWhiteboardScene(db, ROOM, { elements: [image("a")], files: { a: big } })).toBe(TOO_LARGE_STATUS);
    expect(recorder.upserts("whiteboard_scenes")).toHaveLength(0);
  });

  it("reports failure and does not write when the stored files cannot be read", async () => {
    recorder.tableErrors.set("whiteboard_scenes", { message: "offline" });
    expect(await saveWhiteboardScene(db, ROOM, { elements: [image("a")], files: { a: file("a") } })).toBe(FAILED_STATUS);
    expect(recorder.upserts("whiteboard_scenes")).toHaveLength(0);
  });
});
