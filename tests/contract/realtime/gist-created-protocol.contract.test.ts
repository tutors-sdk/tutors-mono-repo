import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GistCreatedEventSchema } from "../support/schemas";
import { validateAgainstSchema } from "../support/validators";
import {
  sendGistCreated,
  setGistSupabase,
  onGistCreated,
  __deliverGistCreated,
  __resetGistBroadcastForTests,
  type SupabaseLike
} from "../../../packages/svelte/community/src/services/gist-broadcast";

/**
 * Protocol contract for the `gist-created` real-time event (issue #155 —
 * student → lecturer shared snippet notification). Mirrors the #78
 * `broadcast-protocol.contract.test.ts` convention.
 *
 * These tests lock the on-the-wire shape of `GistCreatedEvent` (shared by the
 * reader's `ShareSnippet.svelte` sender and the time app's `GistListener`
 * receiver) so the two never drift out of sync.
 *
 * The payload is captured from `sendGistCreated` through a fake Supabase
 * channel rather than hand-written here. An earlier revision validated a
 * literal fixture against the schema; because neither referenced the
 * implementation, the whole suite stayed green when five fields were removed
 * from the wire format. Asserting on what the sender actually emits is what
 * makes this a contract test rather than a test of its own fixture.
 */

const COURSE = "cs101-2025";

interface Sent {
  type: string;
  event: string;
  payload: unknown;
}

/** Records what the module pushes onto the course's broadcast channel. */
function fakeSupabase(sink: Sent[]): SupabaseLike {
  const channel = {
    on() {
      return channel;
    },
    subscribe() {
      return channel;
    },
    send(msg: Sent) {
      sink.push(msg);
      return Promise.resolve("ok");
    }
  };
  return {
    channel: () => channel,
    removeChannel: () => Promise.resolve("ok")
  } as unknown as SupabaseLike;
}

let sent: Sent[];

beforeEach(() => {
  __resetGistBroadcastForTests();
  sent = [];
  setGistSupabase(fakeSupabase(sent));
});

afterEach(() => {
  __resetGistBroadcastForTests();
});

describe("gist-created broadcast protocol", () => {
  it("emits a payload matching the schema", () => {
    expect(sendGistCreated(COURSE)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].event).toBe("gist-created");

    const result = validateAgainstSchema(sent[0].payload, GistCreatedEventSchema);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it("emits exactly the four contracted fields and nothing else", () => {
    sendGistCreated(COURSE);
    // Guards the privacy property directly: the anon key makes this payload
    // readable by any student on the course topic, so the field list is a
    // security boundary, not a style choice.
    expect(Object.keys(sent[0].payload as object).sort()).toEqual([
      "courseId",
      "id",
      "sentAt",
      "type"
    ]);
  });

  it("carries no identifying or authored data", () => {
    sendGistCreated(COURSE);
    const payload = sent[0].payload as Record<string, unknown>;
    for (const leaky of [
      "gistId",
      "gistUrl",
      "student_id",
      "student_name",
      "title",
      "lo_route",
      "lo_title",
      "content",
      "filename"
    ]) {
      expect(payload, `payload must not carry ${leaky}`).not.toHaveProperty(leaky);
    }
  });

  it("rejects a payload that re-adds an identifying field", () => {
    sendGistCreated(COURSE);
    const leaked = { ...(sent[0].payload as object), student_id: "octocat" };
    expect(validateAgainstSchema(leaked, GistCreatedEventSchema).valid).toBe(false);
  });

  it("stamps a unique id and a numeric sentAt on every send", () => {
    sendGistCreated(COURSE);
    sendGistCreated(COURSE);
    const [a, b] = sent.map((s) => s.payload as { id: string; sentAt: number });
    expect(a.id).not.toBe(b.id);
    expect(typeof a.sentAt).toBe("number");
    expect(a.sentAt).toBeGreaterThan(0);
  });

  it("returns false and emits nothing when Supabase is not configured", () => {
    __resetGistBroadcastForTests();
    setGistSupabase(null);
    expect(sendGistCreated(COURSE)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("returns false for a missing courseId", () => {
    expect(sendGistCreated("")).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("rejects a wrong or missing type discriminator", () => {
    sendGistCreated(COURSE);
    const valid = sent[0].payload as Record<string, unknown>;
    expect(validateAgainstSchema({ ...valid, type: "course:broadcast" }, GistCreatedEventSchema).valid).toBe(false);
    const noType = { ...valid };
    delete noType.type;
    expect(validateAgainstSchema(noType, GistCreatedEventSchema).valid).toBe(false);
  });

  it("requires a non-empty id and courseId", () => {
    sendGistCreated(COURSE);
    const valid = sent[0].payload as Record<string, unknown>;
    expect(validateAgainstSchema({ ...valid, id: "" }, GistCreatedEventSchema).valid).toBe(false);
    expect(validateAgainstSchema({ ...valid, courseId: "" }, GistCreatedEventSchema).valid).toBe(false);
  });

  it("requires sentAt to be a number (ms)", () => {
    sendGistCreated(COURSE);
    const valid = sent[0].payload as Record<string, unknown>;
    expect(validateAgainstSchema({ ...valid, sentAt: "now" }, GistCreatedEventSchema).valid).toBe(false);
    const noSentAt = { ...valid };
    delete noSentAt.sentAt;
    expect(validateAgainstSchema(noSentAt, GistCreatedEventSchema).valid).toBe(false);
  });
});

describe("gist-created delivery", () => {
  it("delivers a well-formed event to a subscriber", () => {
    const seen: string[] = [];
    onGistCreated(COURSE, (e) => seen.push(e.id));
    sendGistCreated(COURSE);
    __deliverGistCreated(COURSE, sent[0].payload);
    expect(seen).toHaveLength(1);
  });

  it("delivers exactly once per tab when both paths carry the same event", () => {
    const seen: string[] = [];
    onGistCreated(COURSE, (e) => seen.push(e.id));
    sendGistCreated(COURSE);
    // Supabase and the BroadcastChannel relay both arrive; the idempotency id
    // must collapse them into a single toast.
    __deliverGistCreated(COURSE, sent[0].payload);
    __deliverGistCreated(COURSE, sent[0].payload);
    expect(seen).toHaveLength(1);
  });

  it("ignores an event addressed to a different course", () => {
    const seen: string[] = [];
    onGistCreated(COURSE, (e) => seen.push(e.id));
    sendGistCreated(COURSE);
    const foreign = { ...(sent[0].payload as object), courseId: "other-course" };
    __deliverGistCreated(COURSE, foreign);
    expect(seen).toHaveLength(0);
  });

  it("stops delivering after unsubscribe", () => {
    const seen: string[] = [];
    const off = onGistCreated(COURSE, (e) => seen.push(e.id));
    off();
    sendGistCreated(COURSE);
    __deliverGistCreated(COURSE, sent[0].payload);
    expect(seen).toHaveLength(0);
  });

  it("keeps delivering to healthy listeners when one throws", () => {
    const seen: string[] = [];
    onGistCreated(COURSE, () => {
      throw new Error("broken listener");
    });
    onGistCreated(COURSE, (e) => seen.push(e.id));
    sendGistCreated(COURSE);
    __deliverGistCreated(COURSE, sent[0].payload);
    expect(seen).toHaveLength(1);
  });
});
