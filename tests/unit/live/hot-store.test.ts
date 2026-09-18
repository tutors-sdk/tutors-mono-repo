import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@tutors/live-events";
import { ACTIVE_WINDOW_MS, createMemoryHotStore, createValkeyHotStore, type HotStore, type RedisClient } from "@tutors/live-store";

/**
 * Presence, in both adapters.
 *
 * The same expectations are run against the memory store and against Valkey
 * through a fake client, because the two drifting apart is exactly the bug that
 * would make the dashboard right in dev and wrong in production.
 */

const base = Date.UTC(2026, 8, 17, 10, 0, 0);
const at = (seconds: number) => new Date(base + seconds * 1000);
const stamp = (seconds: number) => at(seconds).toISOString();

/** A sorted set and the handful of commands the hot store uses. */
function fakeRedis(): RedisClient {
  const sets = new Map<string, Map<string, number>>();
  const of = (key: string) => {
    const existing = sets.get(key) ?? new Map<string, number>();
    sets.set(key, existing);
    return existing;
  };
  const score = (bound: number | string, fallback: number) => (bound === "-inf" ? -Infinity : bound === "+inf" ? Infinity : Number(bound ?? fallback));

  return {
    async xAdd() {
      return "0-0";
    },
    async xRead() {
      return null;
    },
    async zAdd(key, member) {
      of(key).set(member.value, member.score);
      return 1;
    },
    async zRem(key, member) {
      return of(key).delete(member) ? 1 : 0;
    },
    async zRemRangeByScore(key, min, max) {
      const low = score(min, -Infinity);
      const high = score(max, Infinity);
      let removed = 0;
      for (const [value, memberScore] of of(key)) {
        if (memberScore >= low && memberScore <= high) {
          of(key).delete(value);
          removed += 1;
        }
      }
      return removed;
    },
    async zRangeWithScores(key, min, max) {
      return [...of(key).entries()]
        .filter(([, memberScore]) => memberScore >= min && memberScore <= max)
        .map(([value, memberScore]) => ({ value, score: memberScore }));
    },
    async expire() {
      return true;
    },
    async keys(pattern) {
      const matcher = new RegExp(`^${pattern.split("*").map(escape).join(".*")}$`);
      return [...sets.keys()].filter((key) => matcher.test(key));
    },
    async quit() {
      return undefined;
    }
  };

  function escape(part: string): string {
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

const adapters: [string, () => HotStore][] = [
  ["memory", () => createMemoryHotStore()],
  ["valkey", () => createValkeyHotStore(fakeRedis())]
];

describe.each(adapters)("hot store (%s)", (_name, create) => {
  async function apply(store: HotStore, events: LiveEvent[]): Promise<void> {
    for (const event of events) await store.touch(event);
  }

  it("counts a session as active while it is inside the window, and forgets it after", async () => {
    const store = create();
    await apply(store, [{ type: "course.opened", ts: stamp(0), sid: "s1", course: "cs101" }]);

    expect((await store.now(at(30))).activeSessions).toBe(1);
    expect((await store.now(at(ACTIVE_WINDOW_MS / 1000 + 1))).activeSessions).toBe(0);
  });

  it("reports where each session is, most popular learning object first", async () => {
    const store = create();
    await apply(store, [
      { type: "lo.viewed", ts: stamp(0), sid: "s1", course: "cs101", lo: "/lab-1", loType: "lab" },
      { type: "lo.viewed", ts: stamp(1), sid: "s2", course: "cs101", lo: "/lab-1", loType: "lab" },
      { type: "lo.viewed", ts: stamp(2), sid: "s3", course: "cs101", lo: "/talk-2", loType: "talk" },
      { type: "lo.viewed", ts: stamp(3), sid: "s4", course: "cs200", lo: "/topic-1", loType: "note" }
    ]);

    const snapshot = await store.now(at(10));
    expect(snapshot.activeSessions).toBe(4);
    expect(snapshot.courses.map((course) => [course.course, course.active])).toEqual([
      ["cs101", 3],
      ["cs200", 1]
    ]);
    expect(snapshot.courses[0].los).toEqual([
      { lo: "/lab-1", count: 2 },
      { lo: "/talk-2", count: 1 }
    ]);
  });

  it("drops a session the moment it ends, without waiting for the window", async () => {
    const store = create();
    await apply(store, [
      { type: "course.opened", ts: stamp(0), sid: "s1", course: "cs101" },
      { type: "session.ended", ts: stamp(5), sid: "s1", course: "cs101", durationSec: 5 }
    ]);
    expect((await store.now(at(6))).activeSessions).toBe(0);
  });

  it("counts service touches over the service window, busiest first", async () => {
    const store = create();
    await apply(store, [
      { type: "service.used", ts: stamp(0), sid: "s1", course: "cs101", service: "lab" },
      { type: "service.used", ts: stamp(1), sid: "s2", course: "cs101", service: "lab" },
      { type: "service.used", ts: stamp(2), sid: "s3", course: "cs101", service: "pdf" }
    ]);

    expect((await store.now(at(10))).services).toEqual([
      { service: "lab", count: 2 },
      { service: "pdf", count: 1 }
    ]);
  });

  it("lists one row per open session, freshest first, with a handle rather than the token", async () => {
    const store = create();
    await apply(store, [
      { type: "lo.viewed", ts: stamp(0), sid: "2026-09-17.oldtoken", course: "cs101", lo: "/lab-1", loType: "lab" },
      { type: "lo.viewed", ts: stamp(40), sid: "2026-09-17.newtoken", course: "cs200", lo: "/talk-2", loType: "talk" }
    ]);

    const { sessions } = await store.now(at(50));
    expect(sessions.map((session) => [session.course, session.lo, session.idleSec])).toEqual([
      ["cs200", "/talk-2", 10],
      ["cs101", "/lab-1", 50]
    ]);
    expect(sessions.every((session) => /^[0-9a-f]{6}$/.test(session.handle))).toBe(true);
    expect(JSON.stringify(sessions)).not.toContain("oldtoken");
  });

  it("drops a session from the rows as soon as it leaves the window", async () => {
    const store = create();
    await apply(store, [{ type: "course.opened", ts: stamp(0), sid: "s1", course: "cs101" }]);

    expect((await store.now(at(30))).sessions).toHaveLength(1);
    expect((await store.now(at(ACTIVE_WINDOW_MS / 1000 + 1))).sessions).toEqual([]);
  });

  it("ignores an event whose timestamp is not a timestamp", async () => {
    const store = create();
    await apply(store, [{ type: "course.opened", ts: "never", sid: "s1", course: "cs101" } as LiveEvent]);
    expect((await store.now(at(1))).activeSessions).toBe(0);
  });
});
