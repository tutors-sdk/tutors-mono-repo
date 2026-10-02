import { beforeEach, describe, expect, it, vi } from "vitest";

type Answer = { data?: unknown; error?: { message: string } | null };

const db = vi.hoisted(() => ({
  client: undefined as unknown,
  head: { error: null } as Answer | Error,
  rpc: { data: [], error: null } as Answer | Error,
  calls: [] as unknown[][]
}));

vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", () => ({
  get supabase() {
    return db.client;
  }
}));

import { checkSupabase, getRecentErrorCounts } from "../../../packages/svelte/community/src/utils/health-check.ts";

function settle(answer: Answer | Error): Promise<Answer> {
  return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
}

beforeEach(() => {
  db.calls = [];
  db.head = { error: null };
  db.rpc = { data: [], error: null };
  db.client = {
    from: (table: string) => ({
      select: (...args: unknown[]) => {
        db.calls.push(["select", table, ...args]);
        return settle(db.head);
      }
    }),
    rpc: (name: string, params: unknown) => {
      db.calls.push(["rpc", name, params]);
      return settle(db.rpc);
    }
  };
});

describe("health check: the database probe", () => {
  it("is skipped in anonymous mode, where there is no client", async () => {
    db.client = undefined;
    expect(await checkSupabase()).toEqual({ status: "skipped", latencyMs: 0, message: "anon mode" });
  });

  it("counts the public catalogue without reading any row", async () => {
    const result = await checkSupabase();
    expect(result.status).toBe("ok");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(db.calls).toEqual([["select", "tutors-connect-courses", "count", { count: "exact", head: true }]]);
  });

  it("reports the database's error", async () => {
    db.head = { error: { message: "permission denied" } };
    expect(await checkSupabase()).toMatchObject({ status: "error", message: "permission denied" });
  });

  it("reports a thrown failure", async () => {
    db.head = new Error("fetch failed");
    expect(await checkSupabase()).toMatchObject({ status: "error", message: "fetch failed" });
  });
});

describe("health check: recent error counts", () => {
  it("asks get_error_counts for the last hour and returns its per-app counts", async () => {
    db.rpc = { data: [{ app: "reader", level: "error", count: 3 }], error: null };
    expect(await getRecentErrorCounts()).toEqual([{ app: "reader", level: "error", count: 3 }]);
    expect(db.calls).toEqual([["rpc", "get_error_counts", { minutes_ago: 60 }]]);
  });

  it("returns no counts in anonymous mode, on an error, or when the call throws", async () => {
    db.rpc = { data: null, error: null };
    expect(await getRecentErrorCounts()).toEqual([]);
    db.rpc = { data: null, error: { message: "function does not exist" } };
    expect(await getRecentErrorCounts()).toEqual([]);
    db.rpc = new Error("fetch failed");
    expect(await getRecentErrorCounts()).toEqual([]);
    db.client = undefined;
    expect(await getRecentErrorCounts()).toEqual([]);
  });
});
