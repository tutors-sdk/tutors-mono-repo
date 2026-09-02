import { describe, it, expect, beforeEach } from "vitest";
import {
  sendCourseBroadcast,
  onCourseBroadcast,
  setBroadcastSupabase,
  __resetForTests,
  __deliverBroadcastChannel,
  __deliverSupabase
} from "../../../packages/svelte/community/src/services/broadcast.ts";

/**
 * Tests for the lecturer → student toast broadcast transport
 * (packages/svelte/community/src/services/broadcast.ts).
 *
 * The module is pure TypeScript (no Svelte runes) so it runs under vitest
 * without the Svelte compiler. We isolate the Supabase path by disabling the
 * BroadcastChannel, then drive delivery through the module's test seams to
 * simulate remote clients / remote tabs.
 */

function createSupabaseMock() {
  const channels: Array<{
    topic: string;
    handlers: Record<string, ((msg: { payload?: unknown }) => void)[]>;
    subscribed: boolean;
    sent: Array<{ type: string; event: string; payload: unknown }>;
    simulate(event: string, payload: unknown): void;
  }> = [];

  const channel = (topic: string) => {
    const ch = {
      topic,
      handlers: {} as Record<string, ((msg: { payload?: unknown }) => void)[]>,
      subscribed: false,
      sent: [] as Array<{ type: string; event: string; payload: unknown }>,
      on(
        this: unknown,
        _type: string,
        filter: { event: string },
        handler: (msg: { payload?: unknown }) => void
      ) {
        (ch.handlers[filter.event] ??= []).push(handler);
        return ch;
      },
      subscribe(this: unknown) {
        ch.subscribed = true;
        return ch;
      },
      send(msg: { type: string; event: string; payload: unknown }) {
        ch.sent.push(msg);
      },
      simulate(event: string, payload: unknown) {
        (ch.handlers[event] ?? []).forEach((h) => h({ payload }));
      }
    };
    channels.push(ch);
    return ch;
  };

  return { channel, removeChannel: () => {}, channels };
}

let supabaseMock: ReturnType<typeof createSupabaseMock> | null = null;

beforeEach(() => {
  supabaseMock = createSupabaseMock();
  __resetForTests();
  setBroadcastSupabase(supabaseMock);
});

const MSG = {
  title: "Quiz open",
  description: "Head to lab 02",
  actionUrl: "/lab-02",
  actionLabel: "Start"
};

function broadcastFor(overrides: Record<string, unknown> = {}) {
  return {
    type: "course:broadcast",
    id: `bc-${Math.random().toString(36).slice(2)}`,
    courseId: "cs101",
    title: "t",
    description: "d",
    senderName: "A",
    sentAt: 1,
    ...overrides
  };
}

describe("sendCourseBroadcast", () => {
  it("sends on the supabase course channel with a well-formed payload", () => {
    expect(sendCourseBroadcast("cs101", MSG, "Alice", 1_000_000)).toBe(true);

    const ch = supabaseMock!.channels.at(-1)!;
    expect(ch.topic).toBe("cs101");
    expect(ch.subscribed).toBe(true);
    expect(ch.sent).toHaveLength(1);

    const [sent] = ch.sent;
    expect(sent.type).toBe("broadcast");
    expect(sent.event).toBe("course-broadcast");
    const payload = sent.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      type: "course:broadcast",
      courseId: "cs101",
      title: "Quiz open",
      description: "Head to lab 02",
      actionUrl: "/lab-02",
      actionLabel: "Start",
      senderName: "Alice",
      sentAt: 1_000_000
    });
    expect(typeof payload.id).toBe("string");
  });

  it("is rate-limited to one broadcast per 60s", () => {
    const t0 = 1_000_000;
    expect(sendCourseBroadcast("cs101", MSG, "Alice", t0)).toBe(true);
    expect(sendCourseBroadcast("cs101", MSG, "Alice", t0 + 30_000)).toBe(false); // inside window
    expect(sendCourseBroadcast("cs101", MSG, "Alice", t0 + 61_000)).toBe(true); // window elapsed
  });

  it("rate-limit is scoped per course (a different course is unaffected)", () => {
    const t0 = 1_000_000;
    expect(sendCourseBroadcast("course-a", MSG, "Alice", t0)).toBe(true);
    expect(sendCourseBroadcast("course-b", MSG, "Alice", t0 + 1_000)).toBe(true);
  });

  it("falls back to 'Tutor' when no sender name is provided", () => {
    sendCourseBroadcast("cs101", MSG, "", 1_000_000);
    const payload = supabaseMock!.channels.at(-1)!.sent[0].payload as Record<string, unknown>;
    expect(payload.senderName).toBe("Tutor");
  });

  it("returns false and does not send when title or description is empty", () => {
    expect(sendCourseBroadcast("cs101", { title: "", description: "d" }, "A", 1_000_000)).toBe(false);
    expect(sendCourseBroadcast("cs101", { title: "t", description: "" }, "A", 1_000_500)).toBe(false);
    // No channel should have been created or sent on.
    const ch = supabaseMock!.channels.find((c) => c.topic === "cs101");
    expect(ch ? ch.sent.length : 0).toBe(0);
  });

  it("returns false when no supabase client is configured", () => {
    setBroadcastSupabase(null);
    __resetForTests();
    expect(sendCourseBroadcast("cs101", MSG, "A", 1_000_000)).toBe(false);
  });
});

describe("onCourseBroadcast (delivery + exactly-once + isolation)", () => {
  it("delivers a broadcast received from another client via Supabase to the handler", () => {
    const seen: unknown[] = [];
    const stop = onCourseBroadcast("cs101", (b) => seen.push(b));

    const ch = supabaseMock!.channels.find((c) => c.topic === "cs101")!;
    const payload = broadcastFor({ id: "remote-1", title: "Break time", description: "Be back in 10", senderName: "Alice" });
    ch.simulate("course-broadcast", payload);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(payload);
    stop();
  });

  it("the sender's own tab sees exactly one toast (via the Supabase echo)", () => {
    const seen: unknown[] = [];
    onCourseBroadcast("cs101", (b) => seen.push(b));

    const ch = supabaseMock!.channels.find((c) => c.topic === "cs101")!;
    sendCourseBroadcast("cs101", MSG, "Alice", 1_000_000);
    const [sentMsg] = ch.sent;

    // Simulate the supabase echo returning to the sender's own channel.
    ch.simulate("course-broadcast", sentMsg.payload);

    // Confirms exactly-once per tab for the sender.
    expect(seen).toHaveLength(1);
  });

  it("a student tab that receives a broadcast via both BC and Supabase sees it only once", () => {
    // Simulates a student tab (different tab, same browser) that gets the
    // broadcast from both the sibling tab's BroadcastChannel relay AND from
    // the Supabase echo. Both paths funnel through the same exactly-once
    // guard, so the toast is shown exactly once.
    const seen: unknown[] = [];
    onCourseBroadcast("cs101", (b) => seen.push(b));

    const payload = {
      type: "course:broadcast",
      id: "from-sister-tab",
      courseId: "cs101",
      title: "t",
      description: "d",
      senderName: "A",
      sentAt: 1
    };
    __deliverBroadcastChannel("cs101", payload); // first path
    __deliverSupabase("cs101", payload);         // second path — same id

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(payload);
  });

  it("ignores broadcasts for a different course", () => {
    const seen: unknown[] = [];
    onCourseBroadcast("cs101", (b) => seen.push(b));

    const ch = supabaseMock!.channels.find((c) => c.topic === "cs101")!;
    ch.simulate("course-broadcast", broadcastFor({ courseId: "other-course", id: "other-1" }));

    expect(seen).toHaveLength(0);
  });

  it("ignores messages that are not a valid course broadcast", () => {
    const seen: unknown[] = [];
    onCourseBroadcast("cs101", (b) => seen.push(b));

    const ch = supabaseMock!.channels.find((c) => c.topic === "cs101")!;
    ch.simulate("course-broadcast", { type: "lo-event", courseId: "cs101" }); // wrong type
    ch.simulate("course-broadcast", null); // null payload
    ch.simulate("course-broadcast", { type: "course:broadcast", courseId: "cs101" }); // missing title/desc

    expect(seen).toHaveLength(0);
  });

  it("unsubscribing stops further delivery", () => {
    const seen: unknown[] = [];
    const stop = onCourseBroadcast("cs101", (b) => seen.push(b));
    stop();

    const ch = supabaseMock!.channels.find((c) => c.topic === "cs101")!;
    ch.simulate("course-broadcast", broadcastFor({ id: "after-1" }));

    expect(seen).toHaveLength(0);
  });

  it("a throwing handler does not prevent delivery to other handlers", () => {
    const seen: unknown[] = [];
    onCourseBroadcast("cs101", () => {
      throw new Error("boom");
    });
    onCourseBroadcast("cs101", (b) => seen.push(b));

    const ch = supabaseMock!.channels.find((c) => c.topic === "cs101")!;
    ch.simulate("course-broadcast", broadcastFor({ id: "two-1" }));

    expect(seen).toHaveLength(1);
  });
});

describe("cross-tab delivery (BroadcastChannel seam)", () => {
  it("__deliverBroadcastChannel routes a message from another tab to the handler", () => {
    const seen: unknown[] = [];
    onCourseBroadcast("cs101", (b) => seen.push(b));

    __deliverBroadcastChannel("cs101", broadcastFor({ id: "tab-1", title: "From another tab" }));

    expect(seen).toHaveLength(1);
    expect((seen[0] as { title: string }).title).toBe("From another tab");
  });
});
