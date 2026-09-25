import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { recordTick } from "../../../apps/reader/src/lib/server/api/store.ts";


const net = { rpcBody: undefined as unknown, updates: [] as unknown[], calendarIncrements: [] as unknown[] };

const stubFetch = (async (...[input, init]: Parameters<typeof fetch>) => {
  const url = String(input instanceof Request ? input.url : input);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.includes("/rest/v1/rpc/get_count_learning_records")) return json(net.rpcBody);
  if (url.includes("/rest/v1/rpc/increment_calendar")) {
    net.calendarIncrements.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  }
  if (url.includes("/rest/v1/learning_records") && init?.method === "PATCH") {
    net.updates.push(JSON.parse(String(init.body)));
    return new Response(null, { status: 204 });
  }
  return json({ message: `unexpected ${init?.method ?? "GET"} ${url}` }, 500);
}) as typeof fetch;

const { createClient } = (await import(createRequire(resolve(__dirname, "../../../apps/reader/package.json")).resolve("@supabase/supabase-js"))) as {
  createClient: (url: string, key: string, options: object) => Parameters<typeof recordTick>[0];
};
const db = createClient("https://mock.supabase.co", "service-role-key", { global: { fetch: stubFetch }, auth: { persistSession: false } });
const tick = () => recordTick(db, "student", { courseId: "course", loId: "lo", day: "2026-09-25" });

beforeEach(() => {
  net.updates = [];
  net.calendarIncrements = [];
});

describe("learning record increments on the reader's server", () => {
  it("counts a first visit as 1 when the student has no record yet (empty array)", async () => {
    net.rpcBody = [];
    await expect(tick()).resolves.toBeUndefined();
    expect(net.updates).toEqual([{ duration: 1 }]);
  });

  it("counts a first visit as 1 when the rpc returns null", async () => {
    net.rpcBody = null;
    await tick();
    expect(net.updates).toEqual([{ duration: 1 }]);
  });

  it("increments an existing record", async () => {
    net.rpcBody = [{ increment: 4 }];
    await tick();
    expect(net.updates).toEqual([{ duration: 5 }]);
  });

  it("adds the tick to the student's calendar row for the browser's day", async () => {
    net.rpcBody = [];
    await tick();
    expect(net.calendarIncrements).toEqual([{ field_name: "timeactive", row_id: "2026-09-25", student_id_value: "student", course_id_value: "course" }]);
  });
});
