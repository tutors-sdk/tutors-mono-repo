import { describe, it, expect } from "vitest";
import { CourseBroadcastSchema } from "../support/schemas";
import { validateAgainstSchema } from "../support/validators";

/**
 * Protocol contract for the lecturer → student toast broadcast (issue #78).
 *
 * These tests lock the on-the-wire shape (the `CourseBroadcast` payload) so
 * the lecturer client and the student client can never drift out of sync.
 * They validate against the shared zod schema — the single source of truth —
 * independent of the runtime implementation.
 */

const validBroadcast = {
  type: "course:broadcast",
  id: "bc-1234",
  courseId: "cs101-2025",
  title: "Quiz is open",
  description: "Head to Lab 02 to start the in-class quiz.",
  actionUrl: "/cs101/lab-02",
  actionLabel: "Start quiz",
  senderName: "Dr. Smith",
  sentAt: 1712000000000
};

describe("CourseBroadcast broadcast protocol", () => {
  it("accepts a valid, fully-populated broadcast", () => {
    const result = validateAgainstSchema(validBroadcast, CourseBroadcastSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a minimal broadcast (actionUrl / actionLabel optional)", () => {
    const minimal = {
      type: validBroadcast.type as "course:broadcast",
      id: validBroadcast.id,
      courseId: validBroadcast.courseId,
      title: validBroadcast.title,
      description: validBroadcast.description,
      senderName: validBroadcast.senderName,
      sentAt: validBroadcast.sentAt
    };
    expect(validateAgainstSchema(minimal, CourseBroadcastSchema).valid).toBe(true);
  });

  it("rejects a wrong or missing type discriminator", () => {
    expect(validateAgainstSchema({ ...validBroadcast, type: "lo-event" }, CourseBroadcastSchema).valid).toBe(false);
    const noType = { ...validBroadcast } as Record<string, unknown>;
    delete noType.type;
    expect(validateAgainstSchema(noType, CourseBroadcastSchema).valid).toBe(false);
  });

  it("requires title and description to be non-empty strings", () => {
    expect(validateAgainstSchema({ ...validBroadcast, title: "" }, CourseBroadcastSchema).valid).toBe(false);
    expect(validateAgainstSchema({ ...validBroadcast, description: "" }, CourseBroadcastSchema).valid).toBe(false);
    expect(
      validateAgainstSchema({ ...validBroadcast, title: 42 }, CourseBroadcastSchema).valid
    ).toBe(false);
  });

  it("requires a non-empty id, courseId and senderName", () => {
    expect(validateAgainstSchema({ ...validBroadcast, id: "" }, CourseBroadcastSchema).valid).toBe(false);
    expect(validateAgainstSchema({ ...validBroadcast, courseId: "" }, CourseBroadcastSchema).valid).toBe(false);
    expect(validateAgainstSchema({ ...validBroadcast, senderName: "" }, CourseBroadcastSchema).valid).toBe(false);
  });

  it("requires sentAt to be a number (ms)", () => {
    expect(validateAgainstSchema({ ...validBroadcast, sentAt: "now" }, CourseBroadcastSchema).valid).toBe(false);
    const noSentAt = { ...validBroadcast } as Record<string, unknown>;
    delete noSentAt.sentAt;
    expect(validateAgainstSchema(noSentAt, CourseBroadcastSchema).valid).toBe(false);
  });

  it("rejects an actionUrl that is not a string", () => {
    expect(validateAgainstSchema({ ...validBroadcast, actionUrl: 123 }, CourseBroadcastSchema).valid).toBe(false);
  });
});
