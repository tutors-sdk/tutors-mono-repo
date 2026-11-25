import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelStatus, JoinOptions } from "../../../packages/application/src/index.ts";
import type { PresenceEvent } from "../../../packages/domain/src/presence/index.ts";

/**
 * The watching half of the PresencePort over Supabase (realtime-supabase/src/presence.ts): a course,
 * or the platform, is one Realtime topic joined through the gateway, hearing its own, plus the
 * watcher report that makes the reader's server publish to it and the stored-activity read that
 * stands in while the day's budget is paused. Only the broker is replaced.
 */
type Joined = { topic: string; options: JoinOptions; onMessage: (event: string, payload: unknown) => void; left: boolean };

const broker = vi.hoisted(() => ({ joined: [] as Joined[] }));

vi.mock("../../../packages/adapters/driven/realtime-supabase/src/broker.ts", () => ({
  supabaseRealtimeAdapter: () => ({
    publish: async () => {},
    join(topic: string, options: JoinOptions, onMessage: Joined["onMessage"], onStatus: (status: ChannelStatus) => void) {
      const channel: Joined = { topic, options, onMessage, left: false };
      broker.joined.push(channel);
      onStatus("SUBSCRIBED");
      return { send: async () => {}, leave: async () => void (channel.left = true) };
    }
  })
}));
vi.mock("@tutors/logger", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { supabasePresence } from "../../../packages/adapters/driven/realtime-supabase/src/presence.ts";

type Query = { table: string; filters: [string, string, unknown][]; limit?: number };

/** The database as the adapter uses it: the watcher report, and reads of tutors-connect-latest. */
function database(answers: { tier?: string | null; rows?: unknown[] | null } = {}) {
  const watched: { p_topic: string; p_watcher: string }[] = [];
  const queries: Query[] = [];
  const client = {
    rpc: async (_name: string, args: { p_topic: string; p_watcher: string }) => {
      watched.push(args);
      return answers.tier === null ? { data: null, error: { message: "no such function" } } : { data: { tier: answers.tier ?? "normal" }, error: null };
    },
    from(table: string) {
      const query: Query = { table, filters: [] };
      queries.push(query);
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => (query.filters.push(["eq", column, value]), builder),
        gte: (column: string, value: unknown) => (query.filters.push(["gte", column, value]), builder),
        order: () => builder,
        limit: (n: number) => ((query.limit = n), builder),
        then: (resolve: (answer: unknown) => unknown) =>
          resolve(answers.rows === null ? { data: null, error: { message: "down" } } : { data: answers.rows ?? [], error: null })
      };
      return builder;
    }
  };
  return { client: client as never, watched, queries };
}

const event = (login: string, courseId: string) => ({ courseId, loRoute: `/lab/${courseId}/1`, user: { id: login } }) as unknown as PresenceEvent;
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  broker.joined = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("supabasePresence.subscribe", () => {
  it("joins the course's topic, hearing its own lo-events, and reports this tab as a watcher", async () => {
    const { client, watched } = database();
    const heard: PresenceEvent[] = [];
    supabasePresence(client).subscribe((e) => heard.push(e), "web-dev-101");
    await settle();

    expect(broker.joined.map(({ topic, options }) => ({ topic, options }))).toEqual([{ topic: "web-dev-101", options: { self: true } }]);
    expect(watched.map((w) => w.p_topic)).toEqual(["web-dev-101"]);
    broker.joined[0]!.onMessage("lo-event", event("alice", "web-dev-101"));
    broker.joined[0]!.onMessage("another-event", event("bob", "web-dev-101"));
    expect(heard.map((e) => e.user?.id)).toEqual(["alice"]);
  });

  it("joins the platform topic when no course is named", async () => {
    const { client, watched } = database();
    supabasePresence(client).subscribe(() => {});
    await settle();

    expect(broker.joined.map((channel) => channel.topic)).toEqual(["tutors-all-course-access"]);
    expect(watched.map((w) => w.p_topic)).toEqual(["tutors-all-course-access"]);
  });

  it("reads stored activity instead, oldest first, while the day's budget is paused", async () => {
    const rows = [{ payload: event("bob", "web-dev-101") }, { payload: event("alice", "web-dev-101") }];
    const { client, queries } = database({ tier: "paused", rows });
    const heard: PresenceEvent[] = [];
    supabasePresence(client).subscribe((e) => heard.push(e), "web-dev-101");
    await settle();

    expect(heard.map((e) => e.user?.id)).toEqual(["alice", "bob"]);
    expect(queries[0]).toMatchObject({
      table: "tutors-connect-latest",
      filters: [
        ["eq", "course_id", "web-dev-101"],
        ["gte", "received_at", "2026-10-28T11:58:00.000Z"]
      ]
    });
  });

  it("reads stored activity across every course, capped, when the platform's watcher report fails", async () => {
    const { client, queries } = database({ tier: null, rows: [{ payload: event("carol", "data-101") }] });
    const heard: PresenceEvent[] = [];
    supabasePresence(client).subscribe((e) => heard.push(e));
    await settle();

    expect(heard.map((e) => e.user?.id)).toEqual(["carol"]);
    expect(queries[0]).toMatchObject({ filters: [["gte", "received_at", "2026-10-28T11:58:00.000Z"]], limit: 200 });
  });

  it("reads nothing stored while the server is publishing", async () => {
    const { client, queries } = database({ tier: "slow" });
    supabasePresence(client).subscribe(() => {}, "web-dev-101");
    await settle();

    expect(queries).toEqual([]);
  });

  it("stops: leaves the topic and makes no further watcher report", async () => {
    const { client, watched } = database();
    const stop = supabasePresence(client).subscribe(() => {}, "web-dev-101");
    await settle();
    stop();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(broker.joined[0]!.left).toBe(true);
    expect(watched).toHaveLength(1);
  });
});

describe("supabasePresence.recent", () => {
  it("gives a course's snapshots since an instant, and tells a failed read (null) from an empty course", async () => {
    const stored = [{ course_id: "web-dev-101", student_id: "alice", payload: {}, received_at: "2026-10-28T11:59:00.000Z" }];
    expect(await supabasePresence(database({ rows: stored }).client).recent("web-dev-101", "2026-10-28T11:00:00.000Z")).toEqual(stored);
    expect(await supabasePresence(database({ rows: null }).client).recent("web-dev-101", "2026-10-28T11:00:00.000Z")).toBeNull();
    expect(await supabasePresence(database().client).recent("  ", "2026-10-28T11:00:00.000Z")).toEqual([]);
  });
});
