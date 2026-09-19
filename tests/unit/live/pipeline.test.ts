import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@tutors/live-events";
import {
  createIngestor,
  createLivePipeline,
  createMemoryBus,
  createMemoryHotStore,
  createMemoryWarehouse,
  liveConfigFromEnv,
  parseTerms,
  resetSharedMemoryBus,
  sharedMemoryBus
} from "@tutors/live-store";

/**
 * The pipeline end to end on the memory adapters: publish on the bus, and the
 * presence view and the warehouse both reflect it.
 *
 * The two things worth pinning are that presence keeps full precision while
 * storage does not, and that a session nobody closed is closed by the sweeper -
 * a shut laptop never sends `session.ended`.
 */

const base = Date.UTC(2026, 8, 17, 10, 0, 0);
const at = (seconds: number) => new Date(base + seconds * 1000);
const stamp = (seconds: number) => at(seconds).toISOString();

function pipeline() {
  const bus = createMemoryBus();
  const hot = createMemoryHotStore();
  const warehouse = createMemoryWarehouse();
  const ingestor = createIngestor({ hot, warehouse, now: () => at(0) });
  return { bus, hot, warehouse, ingestor };
}

const opened: LiveEvent = { type: "course.opened", ts: stamp(0), sid: "s1", course: "cs101" };
const viewed: LiveEvent = { type: "lo.viewed", ts: stamp(42), sid: "s1", course: "cs101", lo: "/lab-1", loType: "lab" };

describe("ingest", () => {
  it("carries an event from the bus to presence and to the warehouse", async () => {
    const { bus, hot, warehouse, ingestor } = pipeline();
    const stop = await ingestor.run(bus);

    await bus.publish([opened, viewed]);

    expect((await hot.now(at(60))).activeSessions).toBe(1);
    const rows = await warehouse.hourly({ from: at(-3600), to: at(3600) });
    expect(rows).toEqual([
      { bucket: "2026-09-17T10:00:00.000Z", course: "cs101", service: null, loType: "lab", views: 1, serviceTouches: 0 }
    ]);

    await stop();
  });

  it("coarsens stored timestamps to the minute but leaves presence at full precision", async () => {
    const { hot, warehouse, ingestor } = pipeline();
    await ingestor.handle(viewed);

    // 10:00:42 is still inside the presence window at 10:01:30, and would not be
    // if it had been rounded down to 10:00:00 before the hot store saw it.
    expect((await hot.now(at(90))).activeSessions).toBe(1);
    const stored = await warehouse.topLos({ from: at(-3600), to: at(3600) }, 10);
    expect(stored).toEqual([{ lo: "/lab-1", loType: "lab", views: 1 }]);
  });

  it("records a session when the client closes it, trusting the client's duration only when it agrees", async () => {
    const { warehouse, ingestor } = pipeline();
    await ingestor.handle(opened);
    await ingestor.handle({ type: "session.ended", ts: stamp(600), sid: "s1", course: "cs101", durationSec: 590 });

    const [session] = await warehouse.sessions({ from: at(-3600), to: at(3600) });
    expect(session).toMatchObject({ sid: "s1", course: "cs101", durationSec: 590, uid: null });
    expect(ingestor.openSessions()).toBe(0);
  });

  it("replaces a client duration that the timestamps contradict", async () => {
    const { warehouse, ingestor } = pipeline();
    await ingestor.handle(opened);
    await ingestor.handle({ type: "session.ended", ts: stamp(600), sid: "s1", course: "cs101", durationSec: 99_999 });

    const [session] = await warehouse.sessions({ from: at(-3600), to: at(3600) });
    expect(session.durationSec).toBe(600);
  });

  it("closes a session that simply stopped, and dates it from the last thing it did", async () => {
    const { warehouse, ingestor } = pipeline();
    await ingestor.handle(opened);
    await ingestor.handle(viewed);

    expect(await ingestor.sweep(at(60))).toBe(0);
    expect(await ingestor.sweep(at(42 + 31 * 60))).toBe(1);

    const [session] = await warehouse.sessions({ from: at(-3600), to: at(7200) });
    expect(session).toMatchObject({ endedAt: stamp(42), durationSec: 42 });
    expect(ingestor.openSessions()).toBe(0);
  });

  it("keeps the opted-in identifier from the session start on the stored session", async () => {
    const { warehouse, ingestor } = pipeline();
    await ingestor.handle({ type: "session.started", ts: stamp(0), sid: "s1", course: "cs101", uid: "hash-1" });
    await ingestor.handle({ type: "session.ended", ts: stamp(120), sid: "s1", course: "cs101", durationSec: 120 });

    expect((await warehouse.sessions({ from: at(-3600), to: at(3600) }))[0].uid).toBe("hash-1");
  });

  it("reports a failing store instead of tearing down the consumer", async () => {
    const failures: unknown[] = [];
    const warehouse = createMemoryWarehouse();
    const ingestor = createIngestor({
      hot: createMemoryHotStore(),
      warehouse: { ...warehouse, append: async () => Promise.reject(new Error("database unreachable")) },
      onError: (error) => failures.push(error)
    });

    await expect(ingestor.handle(opened)).resolves.toBeUndefined();
    expect(failures).toHaveLength(1);
  });
});

describe("pipeline configuration", () => {
  it("defaults every adapter to memory, and runs ingest in-process because nothing else can", () => {
    const config = liveConfigFromEnv({});
    expect(config).toMatchObject({ bus: "memory", hotStore: "memory", warehouse: "memory", ingestInProcess: true, retentionDays: 90 });
  });

  it("hands ingest to the standalone service once there is a real bus", () => {
    const config = liveConfigFromEnv({ LIVE_BUS: "redis", LIVE_HOT_STORE: "valkey", LIVE_WAREHOUSE: "postgres" });
    expect(config).toMatchObject({ bus: "redis", hotStore: "valkey", warehouse: "postgres", ingestInProcess: false });
  });

  it("falls back to memory for a value it does not recognise rather than failing to start", () => {
    expect(liveConfigFromEnv({ LIVE_BUS: "kafka", LIVE_WAREHOUSE: "mysql" })).toMatchObject({ bus: "memory", warehouse: "memory" });
  });

  it("reads term windows from JSON, and ignores anything malformed", () => {
    expect(parseTerms('[{"name":"S1","from":"2026-09-07","to":"2026-12-18"}]')).toEqual([
      { name: "S1", from: "2026-09-07", to: "2026-12-18" }
    ]);
    expect(parseTerms('[{"name":"S1"}]')).toEqual([]);
    expect(parseTerms("not json")).toEqual([]);
    expect(parseTerms(undefined)).toEqual([]);
  });

  it("builds a working memory pipeline, sharing one bus so the endpoint and the consumer meet", async () => {
    resetSharedMemoryBus();
    const built = await createLivePipeline(liveConfigFromEnv({}));

    expect(built.bus).toBe(sharedMemoryBus());
    expect([built.bus.kind, built.hot.kind, built.warehouse.kind]).toEqual(["memory", "memory", "memory"]);

    const ingestor = createIngestor({ hot: built.hot, warehouse: built.warehouse });
    const stop = await ingestor.run(built.bus);
    await built.bus.publish([opened]);
    expect((await built.hot.now(at(30))).activeSessions).toBe(1);

    await stop();
    await built.close();
    resetSharedMemoryBus();
  });

  it("refuses to build a networked adapter with no connection string, rather than silently using memory", async () => {
    await expect(createLivePipeline(liveConfigFromEnv({ LIVE_BUS: "redis" }))).rejects.toThrow("LIVE_REDIS_URL must be set");
  });
});
