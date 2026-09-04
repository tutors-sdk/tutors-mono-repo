import { describe, it, expect } from "vitest";
import { GistCreatedEventSchema } from "../support/schemas";
import { validateAgainstSchema } from "../support/validators";

/**
 * Protocol contract for the `gist-created` real-time event (issue #155 —
 * student → lecturer shared snippet notification). Mirrors the #78
 * `broadcast-protocol.contract.test.ts` convention.
 *
 * These tests lock the on-the-wire shape of `GistCreatedEvent` (shared by the
 * reader's `ShareSnippet.svelte` sender and the time app's `GistListener`
 * receiver) so the two never drift out of sync.
 */

const COURSE = "cs101-2025";
const GIST_ID = "9f2c1b3a-4d5e-4f6a-8b9c-1a2b3c4d5e6f";
const GIST_URL = `https://gist.github.com/octocat/${GIST_ID}`;
const STABLE_ID = "bc-1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const SENT_AT = 1712000000000;

const validEvent = {
  type: "gist-created",
  id: STABLE_ID,
  courseId: COURSE,
  gistId: GIST_ID,
  gistUrl: GIST_URL,
  student_id: "octocat",
  student_name: "The Octocat",
  title: "The error I'm seeing in step 3",
  lo_route: "cs101-2025/topic-01/book-a/book-a",
  lo_title: "Lab: Book A",
  expires_at: "2026-09-06T12:00:00.000Z",
  sentAt: SENT_AT
};

describe("gist-created broadcast protocol", () => {
  it("accepts a valid, fully-populated event", () => {
    expect(validateAgainstSchema(validEvent, GistCreatedEventSchema).valid).toBe(true);
  });

  it("accepts a minimal event (labels / lo / expires optional)", () => {
    const minimal = {
      type: validEvent.type,
      id: validEvent.id,
      courseId: validEvent.courseId,
      gistId: validEvent.gistId,
      gistUrl: validEvent.gistUrl,
      student_id: validEvent.student_id,
      sentAt: validEvent.sentAt
    };
    expect(validateAgainstSchema(minimal, GistCreatedEventSchema).valid).toBe(true);
  });

  it("rejects a wrong or missing type discriminator", () => {
    expect(validateAgainstSchema({ ...validEvent, type: "course:broadcast" }, GistCreatedEventSchema).valid).toBe(false);
    const noType = { ...validEvent } as Record<string, unknown>;
    delete noType.type;
    expect(validateAgainstSchema(noType, GistCreatedEventSchema).valid).toBe(false);
  });

  it("requires a non-empty id, courseId, gistId, and student_id", () => {
    expect(validateAgainstSchema({ ...validEvent, id: "" }, GistCreatedEventSchema).valid).toBe(false);
    expect(validateAgainstSchema({ ...validEvent, courseId: "" }, GistCreatedEventSchema).valid).toBe(false);
    expect(validateAgainstSchema({ ...validEvent, gistId: "" }, GistCreatedEventSchema).valid).toBe(false);
    expect(validateAgainstSchema({ ...validEvent, student_id: "" }, GistCreatedEventSchema).valid).toBe(false);
  });

  it("requires gist_url to be a valid URL", () => {
    expect(validateAgainstSchema({ ...validEvent, gistUrl: "nope" }, GistCreatedEventSchema).valid).toBe(false);
    const noUrl = { ...validEvent } as Record<string, unknown>;
    delete noUrl.gistUrl;
    expect(validateAgainstSchema(noUrl, GistCreatedEventSchema).valid).toBe(false);
  });

  it("requires sentAt to be a number (ms)", () => {
    expect(validateAgainstSchema({ ...validEvent, sentAt: "now" }, GistCreatedEventSchema).valid).toBe(false);
    const noSentAt = { ...validEvent } as Record<string, unknown>;
    delete noSentAt.sentAt;
    expect(validateAgainstSchema(noSentAt, GistCreatedEventSchema).valid).toBe(false);
  });
});
