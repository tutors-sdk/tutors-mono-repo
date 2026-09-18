import { describe, expect, it } from "vitest";
import { createMemoryWarehouse, hourBucket } from "@tutors/live-store";
import { seed, sessionEvents } from "./fixtures.ts";

/**
 * The warehouse contract, on the memory adapter.
 *
 * The distinction these tests defend is the one the schema is built around:
 * views and service touches roll up along every axis, distinct sessions do not,
 * and session counts come from the session table rather than from the hourly
 * rollup.
 */

const now = new Date(Date.UTC(2026, 8, 17, 12, 0, 0));
const range = (fromDaysAgo: number) => ({ from: new Date(now.getTime() - fromDaysAgo * 86_400_000), to: now });

/** An ISO instant `hoursAgo` before the fixed clock. */
function iso(hoursAgo: number): string {
  return new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
}

function spec(sid: string, course: string, hoursAgo: number, views: { lo: string; loType: string; service?: "lab" | "talk" | "pdf" }[]) {
  return { sid, course, at: new Date(now.getTime() - hoursAgo * 3_600_000), views };
}

describe("memory warehouse", () => {
  it("buckets to the start of the UTC hour", () => {
    expect(hourBucket("2026-09-17T10:42:13.000Z")).toBe("2026-09-17T10:00:00.000Z");
  });

  it("rolls views and service touches up per hour, course, service and learning object type", async () => {
    const warehouse = createMemoryWarehouse();
    await seed(warehouse, [
      spec("s1", "cs101", 2, [
        { lo: "/lab-1", loType: "lab", service: "lab" },
        { lo: "/lab-2", loType: "lab", service: "lab" }
      ]),
      spec("s2", "cs101", 2, [{ lo: "/talk-1", loType: "talk", service: "talk" }])
    ]);

    const rows = await warehouse.hourly(range(1));
    const labViews = rows.find((row) => row.loType === "lab" && row.course === "cs101");
    const labTouches = rows.find((row) => row.service === "lab" && row.course === "cs101");

    expect(labViews).toMatchObject({ views: 2, serviceTouches: 0, service: null });
    expect(labTouches).toMatchObject({ views: 0, serviceTouches: 2, loType: null });
    expect(rows.every((row) => row.bucket === hourBucket(row.bucket))).toBe(true);
  });

  it("counts distinct sessions per hour separately, so they are never summed with the rest", async () => {
    const warehouse = createMemoryWarehouse();
    await seed(warehouse, [
      spec("s1", "cs101", 2, [
        { lo: "/lab-1", loType: "lab", service: "lab" },
        { lo: "/lab-2", loType: "lab", service: "lab" }
      ]),
      spec("s2", "cs101", 2, [{ lo: "/talk-1", loType: "talk", service: "talk" }])
    ]);

    const sessions = await warehouse.hourlySessions(range(1));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ course: "cs101", sessions: 2 });
  });

  it("returns a session for any range it overlaps, not only the one it started in", async () => {
    const warehouse = createMemoryWarehouse();
    await seed(warehouse, [spec("s1", "cs101", 26, [{ lo: "/lab-1", loType: "lab" }])]);

    expect(await warehouse.sessions(range(2))).toHaveLength(1);
    expect(await warehouse.sessions(range(0.5))).toHaveLength(0);
  });

  it("keeps both visits when one token opens the same course twice, as the session table does", async () => {
    const warehouse = createMemoryWarehouse();
    const morning = { sid: "t1", course: "cs101", uid: null, startedAt: iso(4), endedAt: iso(3.5), durationSec: 1800 };
    const afternoon = { sid: "t1", course: "cs101", uid: null, startedAt: iso(2), endedAt: iso(1.5), durationSec: 1800 };

    await warehouse.upsertSession(morning);
    await warehouse.upsertSession(afternoon);
    expect(await warehouse.sessions(range(1))).toHaveLength(2);

    // Re-recording the same session replaces it rather than doubling it.
    await warehouse.upsertSession({ ...afternoon, durationSec: 2400 });
    const sessions = await warehouse.sessions(range(1));
    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.durationSec).sort()).toEqual([1800, 2400]);
  });

  it("narrows every query to one course when asked", async () => {
    const warehouse = createMemoryWarehouse();
    await seed(warehouse, [
      spec("s1", "cs101", 2, [{ lo: "/lab-1", loType: "lab", service: "lab" }]),
      spec("s2", "cs200", 2, [{ lo: "/lab-9", loType: "lab", service: "lab" }])
    ]);

    const scoped = { ...range(1), course: "cs101" };
    expect((await warehouse.hourly(scoped)).every((row) => row.course === "cs101")).toBe(true);
    expect((await warehouse.sessions(scoped)).map((session) => session.sid)).toEqual(["s1"]);
    expect(await warehouse.courses(range(1))).toEqual(["cs101", "cs200"]);
  });

  it("ranks the most opened learning objects for the drill-down", async () => {
    const warehouse = createMemoryWarehouse();
    await seed(warehouse, [
      spec("s1", "cs101", 2, [
        { lo: "/lab-1", loType: "lab" },
        { lo: "/lab-1", loType: "lab" },
        { lo: "/talk-1", loType: "talk" }
      ])
    ]);

    expect(await warehouse.topLos({ ...range(1), course: "cs101" }, 10)).toEqual([
      { lo: "/lab-1", loType: "lab", views: 2 },
      { lo: "/talk-1", loType: "talk", views: 1 }
    ]);
  });

  it("erases an opted-out learner from stored events and sessions, keeping the counts", async () => {
    const warehouse = createMemoryWarehouse();
    await seed(warehouse, [{ ...spec("s1", "cs101", 2, [{ lo: "/lab-1", loType: "lab" }]), uid: "hash-1" }]);

    expect(await warehouse.purgeUid("hash-1")).toBe(2);
    expect((await warehouse.sessions(range(1)))[0]).toMatchObject({ sid: "s1", uid: null });
    expect(await warehouse.hourlySessions(range(1))).toHaveLength(1);
  });

  it("drops raw events past the retention window", async () => {
    const warehouse = createMemoryWarehouse({ retentionDays: 1 });
    await warehouse.append(sessionEvents(spec("old", "cs101", 48, [{ lo: "/lab-1", loType: "lab" }])));
    await warehouse.append(sessionEvents(spec("new", "cs101", 1, [{ lo: "/lab-1", loType: "lab" }])));

    const sessions = await warehouse.hourlySessions(range(90));
    expect(sessions.flatMap((row) => row.sessions)).toEqual([1]);
  });
});
