import { describe, it, expect } from "vitest";
import { LoRecordSchema, PartyKitRoomSchema } from "../support/schemas";
import { validateAgainstSchema, assertSchemaMatch } from "../support/validators";

const validLoRecord = {
  courseId: "cs101-2025",
  courseUrl: "https://tutors.dev/cs101-2025",
  title: "Lab 01 - Getting Started",
  courseTitle: "Intro to CS",
  loRoute: "/cs101/topic-01/lab-01",
  user: {
    fullName: "Alice Smith",
    avatar: "https://avatars.githubusercontent.com/u/12345",
    id: "gh-12345",
  },
  type: "lab",
  isPrivate: false,
};

describe("PartyKit LoRecord message protocol", () => {
  it("valid LoRecord message passes", () => {
    const result = validateAgainstSchema(validLoRecord, LoRecordSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("user object requires fullName, avatar, id", () => {
    const record = { ...validLoRecord, user: { fullName: "Alice" } };
    const result = validateAgainstSchema(record, LoRecordSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("avatar"))).toBe(true);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("missing user object fails", () => {
    const { user, ...record } = validLoRecord;
    const result = validateAgainstSchema(record, LoRecordSchema);
    expect(result.valid).toBe(false);
  });

  it("sentiment is optional on user", () => {
    const record = {
      ...validLoRecord,
      user: { ...validLoRecord.user, sentiment: "positive" },
    };
    const result = validateAgainstSchema(record, LoRecordSchema);
    expect(result.valid).toBe(true);
  });

  it("user without sentiment passes", () => {
    const result = validateAgainstSchema(validLoRecord, LoRecordSchema);
    expect(result.valid).toBe(true);
  });

  it("img is optional on message", () => {
    const result = validateAgainstSchema(validLoRecord, LoRecordSchema);
    expect(result.valid).toBe(true);
  });

  it("img is accepted when provided", () => {
    const record = { ...validLoRecord, img: "https://example.com/lab01.png" };
    const result = validateAgainstSchema(record, LoRecordSchema);
    expect(result.valid).toBe(true);
  });

  it("icon is an optional record of strings", () => {
    const record = { ...validLoRecord, icon: { type: "fas", name: "fa-flask" } };
    const result = validateAgainstSchema(record, LoRecordSchema);
    expect(result.valid).toBe(true);
  });

  it("icon omitted passes", () => {
    const result = validateAgainstSchema(validLoRecord, LoRecordSchema);
    expect(result.valid).toBe(true);
  });

  it("isPrivate must be boolean", () => {
    const record = { ...validLoRecord, isPrivate: "false" };
    const result = validateAgainstSchema(record, LoRecordSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("isPrivate"))).toBe(true);
  });

  it("missing courseId fails", () => {
    const { courseId, ...record } = validLoRecord;
    const result = validateAgainstSchema(record, LoRecordSchema);
    expect(result.valid).toBe(false);
  });

  it("missing title fails", () => {
    const { title, ...record } = validLoRecord;
    const result = validateAgainstSchema(record, LoRecordSchema);
    expect(result.valid).toBe(false);
  });

  it("assertSchemaMatch returns parsed LoRecord", () => {
    const parsed = assertSchemaMatch(validLoRecord, LoRecordSchema, "lo record");
    expect(parsed.user.fullName).toBe("Alice Smith");
    expect(parsed.isPrivate).toBe(false);
  });
});

describe("PartyKit room schema", () => {
  it("global room is valid", () => {
    const room = { roomId: "tutors-all-course-access", type: "global" as const };
    const result = validateAgainstSchema(room, PartyKitRoomSchema);
    expect(result.valid).toBe(true);
  });

  it("course room is valid", () => {
    const room = { roomId: "cs101-2025", type: "course" as const };
    const result = validateAgainstSchema(room, PartyKitRoomSchema);
    expect(result.valid).toBe(true);
  });

  it("invalid type fails", () => {
    const room = { roomId: "some-room", type: "private" };
    const result = validateAgainstSchema(room, PartyKitRoomSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });

  it("missing roomId fails", () => {
    const room = { type: "global" };
    const result = validateAgainstSchema(room, PartyKitRoomSchema);
    expect(result.valid).toBe(false);
  });

  it("missing type fails", () => {
    const room = { roomId: "tutors-all-course-access" };
    const result = validateAgainstSchema(room, PartyKitRoomSchema);
    expect(result.valid).toBe(false);
  });

  it("room naming: 'tutors-all-course-access' for global room", () => {
    const room = { roomId: "tutors-all-course-access", type: "global" as const };
    const parsed = assertSchemaMatch(room, PartyKitRoomSchema, "global room");
    expect(parsed.roomId).toBe("tutors-all-course-access");
    expect(parsed.type).toBe("global");
  });

  it("room naming: course-specific room uses courseId", () => {
    const courseId = "cs101-2025";
    const room = { roomId: courseId, type: "course" as const };
    const parsed = assertSchemaMatch(room, PartyKitRoomSchema, "course room");
    expect(parsed.roomId).toBe(courseId);
    expect(parsed.type).toBe("course");
  });
});
