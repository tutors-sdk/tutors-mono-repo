import { afterEach, describe, expect, it } from "vitest";
import { courseVisitorLogins, fullNamesOf, setLock, StoreError, useServerClock } from "../../../packages/adapters/driven/store-supabase/src/server/index.ts";
import { scriptedSupabase } from "../../support/scripted-supabase.ts";

/**
 * The server side of the Supabase adapter: rows are stamped by the clock the app's server installs,
 * and the enrolment reads page through a course's activity.
 */
describe("the server clock seam", () => {
  afterEach(() => useServerClock({ now: () => new Date() }));

  it("stamps a lock with the installed clock, and with whom the route verified", async () => {
    useServerClock({ now: () => new Date("2026-09-16T09:05:00.000Z") });
    const { client, calls } = scriptedSupabase({ tutors_content_locks: [{ error: null }] });
    await setLock(client as never, "lecturer", "cs101", "/lab/cs101/lab-1", true);
    expect(calls).toEqual([
      {
        table: "tutors_content_locks",
        op: "upsert",
        args: [{ course_id: "cs101", lo_route: "/lab/cs101/lab-1", locked: true, locked_by: "lecturer", locked_at: "2026-09-16T09:05:00.000Z" }, { onConflict: "course_id,lo_route" }]
      }
    ]);
  });

  it("reports a failed write as a StoreError naming the table", async () => {
    const { client } = scriptedSupabase({ tutors_content_locks: [{ error: { message: "down" } }] });
    await expect(setLock(client as never, "lecturer", "cs101", "/lab/cs101/lab-1", true)).rejects.toThrow(new StoreError("tutors_content_locks upsert: down"));
  });
});

describe("the reads behind a draft enrollment", () => {
  const rows = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ studentid: `student-${String(from + i).padStart(4, "0")}` }));

  it("lists each visitor of a course once, reading 500 rows at a time until a page is empty", async () => {
    const { client, calls } = scriptedSupabase({ calendar: [{ data: [...rows(0, 499), { studentid: " student-0000 " }] }, { data: [{ studentid: "zoe" }, { studentid: null }, { studentid: " " }] }, { data: [] }] });
    const logins = await courseVisitorLogins(client as never, "cs101");
    expect(logins).toHaveLength(500);
    expect(logins.at(0)).toBe("student-0000");
    expect(logins.at(-1)).toBe("zoe");
    expect(calls.filter((c) => c.op === "range").map((c) => c.args)).toEqual([
      [0, 499],
      [500, 999],
      [503, 1002]
    ]);
    expect(calls.slice(0, 4).map((c) => [c.op, ...c.args])).toEqual([
      ["select", "studentid"],
      ["eq", "courseid", "cs101"],
      ["order", "studentid"],
      ["order", "id"]
    ]);
  });

  it("reports a failed activity read", async () => {
    const { client } = scriptedSupabase({ calendar: [{ data: null, error: { message: "down" } }] });
    await expect(courseVisitorLogins(client as never, "cs101")).rejects.toThrow(new StoreError("calendar read: down"));
  });

  it("reads names a hundred logins at a time and leaves out a learner with none", async () => {
    const logins = Array.from({ length: 101 }, (_, i) => `s${i}`);
    const { client, calls } = scriptedSupabase({
      "tutors-connect-users": [{ data: [{ github_id: "s0", full_name: " Ada A " }, { github_id: "s1", full_name: " " }, { github_id: "s2", full_name: null }] }, { data: null }]
    });
    expect([...(await fullNamesOf(client as never, logins))]).toEqual([["s0", "Ada A"]]);
    const asked = calls.filter((c) => c.op === "in").map((c) => (c.args[1] as string[]).length);
    expect(asked).toEqual([100, 1]);
    expect(calls.find((c) => c.op === "in")?.args[0]).toBe("github_id");
    expect(calls.find((c) => c.op === "select")?.args).toEqual(["github_id, full_name"]);
  });

  it("asks for no names when nobody visited, and reports a failed names read", async () => {
    const none = scriptedSupabase({});
    expect((await fullNamesOf(none.client as never, [])).size).toBe(0);
    expect(none.calls).toEqual([]);
    const { client } = scriptedSupabase({ "tutors-connect-users": [{ data: null, error: { message: "down" } }] });
    await expect(fullNamesOf(client as never, ["s0"])).rejects.toThrow(new StoreError("tutors-connect-users read: down"));
  });
});
