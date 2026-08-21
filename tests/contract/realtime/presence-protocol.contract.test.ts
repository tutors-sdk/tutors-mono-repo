import { describe, it, expect } from "vitest";
import { LoRecordSchema, RealtimeChannelSchema } from "../support/schemas";
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

describe("LoRecord broadcast message protocol", () => {
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

describe("Supabase Realtime channel schema", () => {
  it("global channel is valid", () => {
    const channel = { channelName: "tutors-all-course-access", type: "global" as const };
    const result = validateAgainstSchema(channel, RealtimeChannelSchema);
    expect(result.valid).toBe(true);
  });

  it("course channel is valid", () => {
    const channel = { channelName: "cs101-2025", type: "course" as const };
    const result = validateAgainstSchema(channel, RealtimeChannelSchema);
    expect(result.valid).toBe(true);
  });

  it("invalid type fails", () => {
    const channel = { channelName: "some-channel", type: "private" };
    const result = validateAgainstSchema(channel, RealtimeChannelSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });

  it("missing channelName fails", () => {
    const channel = { type: "global" };
    const result = validateAgainstSchema(channel, RealtimeChannelSchema);
    expect(result.valid).toBe(false);
  });

  it("missing type fails", () => {
    const channel = { channelName: "tutors-all-course-access" };
    const result = validateAgainstSchema(channel, RealtimeChannelSchema);
    expect(result.valid).toBe(false);
  });

  it("channel naming: 'tutors-all-course-access' for global channel", () => {
    const channel = { channelName: "tutors-all-course-access", type: "global" as const };
    const parsed = assertSchemaMatch(channel, RealtimeChannelSchema, "global channel");
    expect(parsed.channelName).toBe("tutors-all-course-access");
    expect(parsed.type).toBe("global");
  });

  it("channel naming: course-specific channel uses courseId", () => {
    const courseId = "cs101-2025";
    const channel = { channelName: courseId, type: "course" as const };
    const parsed = assertSchemaMatch(channel, RealtimeChannelSchema, "course channel");
    expect(parsed.channelName).toBe(courseId);
    expect(parsed.type).toBe("course");
  });
});
