import { describe, it, expect } from "vitest";
import {
  WhiteboardSceneUpdateSchema,
  WhiteboardCursorUpdateSchema,
  WhiteboardPresenceSchema,
  WhiteboardInitEditorSchema,
  WhiteboardSetThemeSchema,
} from "../support/schemas";
import { validateAgainstSchema, assertSchemaMatch } from "../support/validators";

const validAppState = { viewBackgroundColor: "#ffffff" };

// The broadcasts' versions, recorded payloads and the editor's own script are held together in
// tests/contract/messages (Rules 0623-0625); these cases pin the individual fields.

const validElement = {
  id: "elem-1",
  version: 3,
  type: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
};

describe("Whiteboard scene-update broadcast", () => {
  it("valid payload passes, and an element keeps Excalidraw's own fields", () => {
    const result = validateAgainstSchema({ elements: [validElement] }, WhiteboardSceneUpdateSchema);
    expect(result.valid).toBe(true);
  });

  it("element without a version fails: peers compare versions to keep the newest", () => {
    const { version, ...element } = validElement;
    const result = validateAgainstSchema({ elements: [element] }, WhiteboardSceneUpdateSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("version"))).toBe(true);
  });

  it("missing elements fails", () => {
    expect(validateAgainstSchema({}, WhiteboardSceneUpdateSchema).valid).toBe(false);
  });
});

describe("Whiteboard cursor-update broadcast", () => {
  const cursor = { userId: "alice", userName: "Alice", color: "#FF6B6B", pointer: { x: 4, y: 5 }, button: "up" };

  it("valid payload passes", () => {
    expect(validateAgainstSchema(cursor, WhiteboardCursorUpdateSchema).valid).toBe(true);
  });

  it("button must be up or down", () => {
    const result = validateAgainstSchema({ ...cursor, button: "middle" }, WhiteboardCursorUpdateSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("button"))).toBe(true);
  });

  it("missing userId fails: peers key collaborators by it", () => {
    const { userId, ...rest } = cursor;
    expect(validateAgainstSchema(rest, WhiteboardCursorUpdateSchema).valid).toBe(false);
  });
});

describe("Whiteboard presence", () => {
  it("valid presence passes; missing color fails", () => {
    const presence = { userId: "alice", userName: "Alice", avatar: "alice.png", color: "#4ECDC4" };
    expect(validateAgainstSchema(presence, WhiteboardPresenceSchema).valid).toBe(true);
    const { color, ...rest } = presence;
    expect(validateAgainstSchema(rest, WhiteboardPresenceSchema).valid).toBe(false);
  });
});

describe("Whiteboard init-editor postMessage", () => {
  const validInit = {
    type: "init-editor" as const,
    supabaseUrl: "https://test-project.supabase.co",
    supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-key",
    roomId: "wb-cs101-whiteboard-01",
    user: {
      name: "Alice Smith",
      id: "alice-gh",
      avatar: "https://avatars.githubusercontent.com/u/12345",
    },
    initialScene: null,
  };

  it("valid init-editor passes", () => {
    const result = validateAgainstSchema(validInit, WhiteboardInitEditorSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("initialScene can be null", () => {
    const result = validateAgainstSchema(validInit, WhiteboardInitEditorSchema);
    expect(result.valid).toBe(true);
  });

  it("initialScene can be a scene object", () => {
    const record = { ...validInit, initialScene: { elements: [], appState: validAppState } };
    const result = validateAgainstSchema(record, WhiteboardInitEditorSchema);
    expect(result.valid).toBe(true);
  });

  it("missing supabaseUrl fails", () => {
    const { supabaseUrl, ...record } = validInit;
    const result = validateAgainstSchema(record, WhiteboardInitEditorSchema);
    expect(result.valid).toBe(false);
  });

  it("missing supabaseAnonKey fails", () => {
    const { supabaseAnonKey, ...record } = validInit;
    const result = validateAgainstSchema(record, WhiteboardInitEditorSchema);
    expect(result.valid).toBe(false);
  });

  it("missing roomId fails", () => {
    const { roomId, ...record } = validInit;
    const result = validateAgainstSchema(record, WhiteboardInitEditorSchema);
    expect(result.valid).toBe(false);
  });

  it("missing user fails", () => {
    const { user, ...record } = validInit;
    const result = validateAgainstSchema(record, WhiteboardInitEditorSchema);
    expect(result.valid).toBe(false);
  });

  it("user requires name, id, avatar", () => {
    const record = { ...validInit, user: { name: "Alice" } };
    const result = validateAgainstSchema(record, WhiteboardInitEditorSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
    expect(result.errors.some((e) => e.includes("avatar"))).toBe(true);
  });

  it("assertSchemaMatch returns parsed init-editor", () => {
    const parsed = assertSchemaMatch(validInit, WhiteboardInitEditorSchema, "init-editor");
    expect(parsed.type).toBe("init-editor");
    expect(parsed.user.name).toBe("Alice Smith");
    expect(parsed.initialScene).toBeNull();
  });
});

describe("Whiteboard set-theme postMessage", () => {
  it("accepts the light and dark appearances", () => {
    for (const theme of ["light", "dark"]) {
      expect(validateAgainstSchema({ type: "set-theme", theme }, WhiteboardSetThemeSchema).valid).toBe(true);
    }
  });

  it("rejects any other theme, and init-editor accepts the same optional theme", () => {
    expect(validateAgainstSchema({ type: "set-theme", theme: "sepia" }, WhiteboardSetThemeSchema).valid).toBe(false);
    expect(validateAgainstSchema({ type: "set-theme" }, WhiteboardSetThemeSchema).valid).toBe(false);
    const init = { type: "init-editor", supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "k", roomId: "wb-1", user: { name: "A", id: "a", avatar: "" }, initialScene: null };
    expect(validateAgainstSchema({ ...init, theme: "dark" }, WhiteboardInitEditorSchema).valid).toBe(true);
    expect(validateAgainstSchema({ ...init, theme: "sepia" }, WhiteboardInitEditorSchema).valid).toBe(false);
  });
});
