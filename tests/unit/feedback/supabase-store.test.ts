import { describe, expect, it } from "vitest";
import { annotationFromRow, serviceClient, supabaseFeedbackStore } from "../../../packages/svelte/utils/feedback/src/server/index.ts";
import { RECEIVED_LIMIT } from "../../../packages/svelte/utils/feedback/src/index.ts";

type Row = Record<string, unknown>;
type Call = { op: string; filters: [string, string, unknown][]; order: [string, boolean][]; limit?: number; row?: Row; single?: boolean };

/** A Supabase client over one table in memory, recording each query's shape. */
function fakeSupabase(failWith?: string) {
  const rows: Row[] = [];
  const calls: Call[] = [];
  let next = 0;
  const from = () => {
    const call: Call = { op: "select", filters: [], order: [] };
    calls.push(call);
    const matches = (r: Row) => call.filters.every(([kind, col, value]) => (kind === "is" ? r[col] === value : r[col] === value));
    const run = () => {
      if (failWith) return { data: null, error: { message: failWith } };
      if (call.op === "insert") {
        const kept = { id: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`, revoked_at: null, ...call.row };
        rows.push(kept);
        return { data: call.single ? kept : [kept], error: null };
      }
      if (call.op === "update") {
        rows.filter(matches).forEach((r) => Object.assign(r, call.row));
        return { data: null, error: null };
      }
      let found = rows.filter(matches);
      for (const [col, ascending] of [...call.order].reverse()) found = [...found].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (ascending ? 1 : -1));
      return { data: call.limit === undefined ? found : found.slice(0, call.limit), error: null };
    };
    const builder = {
      select: () => builder,
      insert: (row: Row) => ((call.op = "insert"), (call.row = row), builder),
      update: (row: Row) => ((call.op = "update"), (call.row = row), builder),
      eq: (col: string, value: unknown) => (call.filters.push(["eq", col, value]), builder),
      is: (col: string, value: unknown) => (call.filters.push(["is", col, value]), builder),
      order: (col: string, opts: { ascending: boolean }) => (call.order.push([col, opts.ascending]), builder),
      limit: (n: number) => ((call.limit = n), builder),
      single: () => ((call.single = true), builder),
      then: (resolve: (value: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject)
    };
    return builder;
  };
  return { client: { from } as never, rows, calls };
}

const ref = { courseId: "cs101", labRoute: "/lab/cs101/lab-01", stepId: "02" };

describe("supabaseFeedbackStore", () => {
  it("keeps an annotation and reads it back by id and by step, oldest first", async () => {
    const { client, rows } = fakeSupabase();
    const store = supabaseFeedbackStore(client);
    const first = await store.annotate({ ref, audience: { kind: "everyone" }, body: "For all.", authorId: "ellen", createdAt: "2026-01-05T09:00:00.000Z" });
    const second = await store.annotate({ ref, audience: { kind: "student", learnerId: "alice" }, body: "For alice.", authorId: "ellen", createdAt: "2026-01-05T09:05:00.000Z" });
    expect(rows[1]).toMatchObject({ audience: "student", learner_id: "alice", course_id: "cs101", lab_route: "/lab/cs101/lab-01", step_id: "02" });
    expect(rows[0].learner_id).toBeNull();
    expect(await store.get(first.id)).toEqual(first);
    expect((await store.forStep(ref)).map((a) => a.body)).toEqual(["For all.", "For alice."]);
    expect(second.audience).toEqual({ kind: "student", learnerId: "alice" });
  });

  it("answers null for an id that is not a uuid, without asking the database", async () => {
    const { client, calls } = fakeSupabase();
    const store = supabaseFeedbackStore(client);
    expect(await store.get("not-a-uuid")).toBeNull();
    expect(await store.revoke("not-a-uuid", "2026-01-05T10:00:00.000Z")).toBeNull();
    expect(calls).toEqual([]);
    expect(await store.get("00000000-0000-4000-8000-000000000099")).toBeNull();
  });

  it("reads a learner's and the course's explanations in two filtered reads, newest first, leaving out the revoked", async () => {
    const { client, calls } = fakeSupabase();
    const store = supabaseFeedbackStore(client);
    await store.annotate({ ref, audience: { kind: "everyone" }, body: "Old.", authorId: "ellen", createdAt: "2026-01-05T09:00:00.000Z" });
    const revoked = await store.annotate({ ref, audience: { kind: "everyone" }, body: "Gone.", authorId: "ellen", createdAt: "2026-01-05T09:01:00.000Z" });
    await store.annotate({ ref, audience: { kind: "student", learnerId: "alice" }, body: "Mine.", authorId: "ellen", createdAt: "2026-01-05T09:02:00.000Z" });
    await store.annotate({ ref, audience: { kind: "student", learnerId: "bob" }, body: "Bob's.", authorId: "ellen", createdAt: "2026-01-05T09:03:00.000Z" });
    await store.revoke(revoked.id, "2026-01-05T10:00:00.000Z");
    calls.length = 0;
    expect((await store.received("cs101", "alice")).map((a) => a.body)).toEqual(["Mine.", "Old."]);
    expect(calls.map((c) => c.limit)).toEqual([RECEIVED_LIMIT, RECEIVED_LIMIT]);
    expect(calls[0].filters).toContainEqual(["eq", "learner_id", "alice"]);
    expect(calls[1].filters).toContainEqual(["eq", "audience", "everyone"]);
  });

  it("keeps the first revocation time", async () => {
    const { client } = fakeSupabase();
    const store = supabaseFeedbackStore(client);
    const kept = await store.annotate({ ref, audience: { kind: "everyone" }, body: "x", authorId: "ellen", createdAt: "2026-01-05T09:00:00.000Z" });
    expect((await store.revoke(kept.id, "2026-01-05T10:00:00.000Z"))?.revokedAt).toBe("2026-01-05T10:00:00.000Z");
    expect((await store.revoke(kept.id, "2026-01-05T11:00:00.000Z"))?.revokedAt).toBe("2026-01-05T10:00:00.000Z");
  });

  it("rejects when the database answers an error", async () => {
    const store = supabaseFeedbackStore(fakeSupabase("permission denied").client);
    await expect(store.forStep(ref)).rejects.toThrow("permission denied");
    await expect(store.annotate({ ref, audience: { kind: "everyone" }, body: "x", authorId: "ellen", createdAt: "2026-01-05T09:00:00.000Z" })).rejects.toThrow();
  });

  it("reads Postgres timestamps as ISO strings and a row without a learner as for everyone", () => {
    const annotation = annotationFromRow({
      id: "a",
      course_id: "cs101",
      lab_route: "/lab/cs101/lab-01",
      step_id: "02",
      audience: "student",
      learner_id: null,
      body: "x",
      author_id: "ellen",
      created_at: "2026-01-05 09:00:00+00",
      revoked_at: "2026-01-05 10:00:00+00"
    });
    expect(annotation.audience).toEqual({ kind: "everyone" });
    expect(annotation.createdAt).toBe("2026-01-05T09:00:00.000Z");
    expect(annotation.revokedAt).toBe("2026-01-05T10:00:00.000Z");
  });

  it("makes a service client only with a URL and a key, keeping no session", () => {
    expect(serviceClient(undefined, "key")).toBeNull();
    expect(serviceClient("https://x.supabase.co", " ")).toBeNull();
    const client = serviceClient("https://x.supabase.co", "key") as unknown as { supabaseUrl: string; supabaseKey: string };
    expect(client.supabaseUrl).toBe("https://x.supabase.co");
    expect(client.supabaseKey).toBe("key");
  });
});
