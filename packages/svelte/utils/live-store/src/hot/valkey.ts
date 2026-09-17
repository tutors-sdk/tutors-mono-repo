import { isService, type LiveEvent } from "@tutors/live-events";
import type { RedisClient } from "../drivers.ts";
import type { HotStore, NowSnapshot } from "../types.ts";
import { ACTIVE_WINDOW_MS, SERVICE_WINDOW_MS, snapshotOf, type Presence, type Touch } from "./window.ts";

/**
 * The hot store on Valkey (or Redis - same commands).
 *
 * Every key is a sorted set scored by event time rather than a plain set with a
 * TTL: presence has to expire per member, not per key, and a sorted set is the
 * only structure that expires the member that went quiet while keeping the rest.
 *
 *   live:sessions:<course>         sid          -> last seen
 *   live:course:<course>:current   sid|lo       -> last seen
 *   live:services:now              service|sid  -> last seen
 */
export function createValkeyHotStore(client: RedisClient, keyPrefix = "live"): HotStore {
  const sessionsKey = (course: string) => `${keyPrefix}:sessions:${course}`;
  const currentKey = (course: string) => `${keyPrefix}:course:${course}:current`;
  const servicesKey = `${keyPrefix}:services:now`;
  /** Keys outlive their members by a margin, so a quiet course disappears on its own. */
  const keyTtlSeconds = Math.ceil((SERVICE_WINDOW_MS * 2) / 1000);

  return {
    kind: "valkey",

    async touch(event: LiveEvent): Promise<void> {
      const at = Date.parse(event.ts);
      if (Number.isNaN(at)) return;

      if (event.type === "session.ended") {
        await client.zRem(sessionsKey(event.course), event.sid);
      } else {
        await client.zAdd(sessionsKey(event.course), { score: at, value: event.sid });
        await client.expire(sessionsKey(event.course), keyTtlSeconds);
      }

      if (event.type === "lo.viewed" || (event.type === "session.heartbeat" && event.lo)) {
        const lo = event.type === "lo.viewed" ? event.lo : event.lo!;
        await client.zAdd(currentKey(event.course), { score: at, value: `${event.sid}|${lo}` });
        await client.expire(currentKey(event.course), keyTtlSeconds);
      }

      if (event.type === "service.used") {
        await client.zAdd(servicesKey, { score: at, value: `${event.service}|${event.sid}` });
        await client.expire(servicesKey, keyTtlSeconds);
      }

      await prune(at);
    },

    async now(at: Date = new Date()): Promise<NowSnapshot> {
      const stamp = at.getTime();
      await prune(stamp);

      const keys = await client.keys(`${keyPrefix}:sessions:*`);
      const presences: Presence[] = [];
      for (const key of keys) {
        const course = key.slice(`${keyPrefix}:sessions:`.length);
        const members = await client.zRangeWithScores(key, stamp - ACTIVE_WINDOW_MS, stamp, { BY: "SCORE" });
        if (members.length === 0) continue;
        const los = await currentLos(course, stamp);
        for (const member of members) {
          const lo = los.get(member.value);
          presences.push({ sid: member.value, course, at: member.score, ...(lo ? { lo } : {}) });
        }
      }

      const touchMembers = await client.zRangeWithScores(servicesKey, stamp - SERVICE_WINDOW_MS, stamp, { BY: "SCORE" });
      const touches: Touch[] = [];
      for (const member of touchMembers) {
        const [service, sid] = member.value.split("|");
        if (isService(service)) touches.push({ service, sid: sid ?? "", at: member.score });
      }

      return snapshotOf(presences, touches, at);
    },

    async close(): Promise<void> {
      await client.quit();
    }
  };

  /** sid -> the learning object it was last seen on, inside the presence window. */
  async function currentLos(course: string, stamp: number): Promise<Map<string, string>> {
    const members = await client.zRangeWithScores(currentKey(course), stamp - ACTIVE_WINDOW_MS, stamp, { BY: "SCORE" });
    const los = new Map<string, string>();
    for (const member of members) {
      const separator = member.value.indexOf("|");
      if (separator < 0) continue;
      los.set(member.value.slice(0, separator), member.value.slice(separator + 1));
    }
    return los;
  }

  async function prune(stamp: number): Promise<void> {
    for (const key of await client.keys(`${keyPrefix}:sessions:*`)) {
      await client.zRemRangeByScore(key, "-inf", stamp - ACTIVE_WINDOW_MS);
    }
    for (const key of await client.keys(`${keyPrefix}:course:*:current`)) {
      await client.zRemRangeByScore(key, "-inf", stamp - ACTIVE_WINDOW_MS);
    }
    await client.zRemRangeByScore(servicesKey, "-inf", stamp - SERVICE_WINDOW_MS);
  }
}
