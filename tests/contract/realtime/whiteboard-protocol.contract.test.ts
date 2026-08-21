import { describe, it, expect } from "vitest";
import {
  WhiteboardSceneInitSchema,
  WhiteboardSceneUpdateSchema,
  WhiteboardSceneSnapshotSchema,
  WhiteboardCursorUpdateSchema,
  WhiteboardUserJoinedSchema,
  WhiteboardUserLeftSchema,
  WhiteboardRoomSchema,
  WhiteboardInitEditorSchema,
} from "../support/schemas";
import { validateAgainstSchema, assertSchemaMatch } from "../support/validators";

const validElement = {
  id: "elem-1",
  version: 3,
  type: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
};

const validUser = {
  name: "Alice Smith",
  id: "alice-gh",
  avatar: "https://avatars.githubusercontent.com/u/12345",
  color: "#FF6B6B",
};

const validAppState = {
  viewBackgroundColor: "#ffffff",
};

describe("Whiteboard scene-init message", () => {
  const validSceneInit = {
    type: "scene-init" as const,
    elements: [validElement],
    appState: validAppState,
  };

  it("valid scene-init passes", () => {
    const result = validateAgainstSchema(validSceneInit, WhiteboardSceneInitSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("scene-init with files passes", () => {
    const record = { ...validSceneInit, files: { "file-1": { mimeType: "image/png", data: "base64..." } } };
    const result = validateAgainstSchema(record, WhiteboardSceneInitSchema);
    expect(result.valid).toBe(true);
  });

  it("files is optional", () => {
    const result = validateAgainstSchema(validSceneInit, WhiteboardSceneInitSchema);
    expect(result.valid).toBe(true);
  });

  it("missing elements fails", () => {
    const { elements, ...record } = validSceneInit;
    const result = validateAgainstSchema(record, WhiteboardSceneInitSchema);
    expect(result.valid).toBe(false);
  });

  it("missing appState fails", () => {
    const { appState, ...record } = validSceneInit;
    const result = validateAgainstSchema(record, WhiteboardSceneInitSchema);
    expect(result.valid).toBe(false);
  });

  it("elements require id and version", () => {
    const record = { ...validSceneInit, elements: [{ type: "rectangle" }] };
    const result = validateAgainstSchema(record, WhiteboardSceneInitSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("wrong type literal fails", () => {
    const record = { ...validSceneInit, type: "scene-update" };
    const result = validateAgainstSchema(record, WhiteboardSceneInitSchema);
    expect(result.valid).toBe(false);
  });

  it("assertSchemaMatch returns parsed scene-init", () => {
    const parsed = assertSchemaMatch(validSceneInit, WhiteboardSceneInitSchema, "scene-init");
    expect(parsed.type).toBe("scene-init");
    expect(parsed.elements).toHaveLength(1);
    expect(parsed.elements[0].id).toBe("elem-1");
  });
});

describe("Whiteboard scene-update message", () => {
  it("valid client->server update (no source) passes", () => {
    const record = { type: "scene-update" as const, elements: [validElement] };
    const result = validateAgainstSchema(record, WhiteboardSceneUpdateSchema);
    expect(result.valid).toBe(true);
  });

  it("valid server->client update (with source) passes", () => {
    const record = { type: "scene-update" as const, elements: [validElement], source: "conn-123" };
    const result = validateAgainstSchema(record, WhiteboardSceneUpdateSchema);
    expect(result.valid).toBe(true);
  });

  it("empty elements array passes", () => {
    const record = { type: "scene-update" as const, elements: [] };
    const result = validateAgainstSchema(record, WhiteboardSceneUpdateSchema);
    expect(result.valid).toBe(true);
  });

  it("missing elements fails", () => {
    const record = { type: "scene-update" as const };
    const result = validateAgainstSchema(record, WhiteboardSceneUpdateSchema);
    expect(result.valid).toBe(false);
  });

  it("extra element fields are allowed (passthrough)", () => {
    const elem = { ...validElement, strokeColor: "#000", fillStyle: "solid" };
    const record = { type: "scene-update" as const, elements: [elem] };
    const result = validateAgainstSchema(record, WhiteboardSceneUpdateSchema);
    expect(result.valid).toBe(true);
  });
});

describe("Whiteboard scene-snapshot message", () => {
  const validSnapshot = {
    type: "scene-snapshot" as const,
    elements: [validElement],
    appState: validAppState,
    files: {},
  };

  it("valid snapshot passes", () => {
    const result = validateAgainstSchema(validSnapshot, WhiteboardSceneSnapshotSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("missing appState fails", () => {
    const { appState, ...record } = validSnapshot;
    const result = validateAgainstSchema(record, WhiteboardSceneSnapshotSchema);
    expect(result.valid).toBe(false);
  });

  it("missing files fails (required on snapshot)", () => {
    const { files, ...record } = validSnapshot;
    const result = validateAgainstSchema(record, WhiteboardSceneSnapshotSchema);
    expect(result.valid).toBe(false);
  });

  it("assertSchemaMatch returns parsed snapshot", () => {
    const parsed = assertSchemaMatch(validSnapshot, WhiteboardSceneSnapshotSchema, "snapshot");
    expect(parsed.type).toBe("scene-snapshot");
    expect(parsed.appState.viewBackgroundColor).toBe("#ffffff");
  });
});

describe("Whiteboard cursor-update message", () => {
  const validCursor = {
    type: "cursor-update" as const,
    user: validUser,
    pointer: { x: 150.5, y: 200.3 },
    button: "down" as const,
  };

  it("valid cursor update passes", () => {
    const result = validateAgainstSchema(validCursor, WhiteboardCursorUpdateSchema);
    expect(result.valid).toBe(true);
  });

  it("button must be up or down", () => {
    const record = { ...validCursor, button: "middle" };
    const result = validateAgainstSchema(record, WhiteboardCursorUpdateSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("button"))).toBe(true);
  });

  it("pointer requires x and y numbers", () => {
    const record = { ...validCursor, pointer: { x: "not-a-number", y: 10 } };
    const result = validateAgainstSchema(record, WhiteboardCursorUpdateSchema);
    expect(result.valid).toBe(false);
  });

  it("missing pointer fails", () => {
    const { pointer, ...record } = validCursor;
    const result = validateAgainstSchema(record, WhiteboardCursorUpdateSchema);
    expect(result.valid).toBe(false);
  });

  it("missing user fails", () => {
    const { user, ...record } = validCursor;
    const result = validateAgainstSchema(record, WhiteboardCursorUpdateSchema);
    expect(result.valid).toBe(false);
  });

  it("source is optional (present on server->client)", () => {
    const record = { ...validCursor, source: "conn-456" };
    const result = validateAgainstSchema(record, WhiteboardCursorUpdateSchema);
    expect(result.valid).toBe(true);
  });

  it("user color is optional", () => {
    const record = { ...validCursor, user: { name: "Bob", id: "bob", avatar: "https://example.com/bob.png" } };
    const result = validateAgainstSchema(record, WhiteboardCursorUpdateSchema);
    expect(result.valid).toBe(true);
  });
});

describe("Whiteboard user-joined / user-left messages", () => {
  it("valid user-joined passes", () => {
    const record = { type: "user-joined" as const, user: validUser };
    const result = validateAgainstSchema(record, WhiteboardUserJoinedSchema);
    expect(result.valid).toBe(true);
  });

  it("user-joined missing user fails", () => {
    const record = { type: "user-joined" as const };
    const result = validateAgainstSchema(record, WhiteboardUserJoinedSchema);
    expect(result.valid).toBe(false);
  });

  it("valid user-left passes", () => {
    const record = { type: "user-left" as const, userId: "conn-123" };
    const result = validateAgainstSchema(record, WhiteboardUserLeftSchema);
    expect(result.valid).toBe(true);
  });

  it("user-left missing userId fails", () => {
    const record = { type: "user-left" as const };
    const result = validateAgainstSchema(record, WhiteboardUserLeftSchema);
    expect(result.valid).toBe(false);
  });
});

describe("Whiteboard room schema", () => {
  it("room ID starting with wb- passes", () => {
    const room = { roomId: "wb-cs101-topic-01-whiteboard-01", type: "whiteboard" as const };
    const result = validateAgainstSchema(room, WhiteboardRoomSchema);
    expect(result.valid).toBe(true);
  });

  it("room ID not starting with wb- fails", () => {
    const room = { roomId: "cs101-whiteboard", type: "whiteboard" as const };
    const result = validateAgainstSchema(room, WhiteboardRoomSchema);
    expect(result.valid).toBe(false);
  });

  it("type must be whiteboard", () => {
    const room = { roomId: "wb-test", type: "course" };
    const result = validateAgainstSchema(room, WhiteboardRoomSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });

  it("missing roomId fails", () => {
    const room = { type: "whiteboard" };
    const result = validateAgainstSchema(room, WhiteboardRoomSchema);
    expect(result.valid).toBe(false);
  });

  it("missing type fails", () => {
    const room = { roomId: "wb-test" };
    const result = validateAgainstSchema(room, WhiteboardRoomSchema);
    expect(result.valid).toBe(false);
  });

  it("assertSchemaMatch returns parsed room", () => {
    const room = { roomId: "wb-cs101-drawing", type: "whiteboard" as const };
    const parsed = assertSchemaMatch(room, WhiteboardRoomSchema, "whiteboard room");
    expect(parsed.roomId).toBe("wb-cs101-drawing");
    expect(parsed.type).toBe("whiteboard");
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
