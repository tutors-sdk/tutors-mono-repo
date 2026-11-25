import { describe, it, expect, vi, beforeEach } from "vitest";

// health-check reads the composed client at call time and treats an absent one as anon mode.
import { configureSupabase } from "../../../packages/adapters/driven/store-supabase/src/client.ts";
import { HEALTH_CHECK_TIMEOUT_MS, checkSupabase, getRecentErrorCounts } from "../../../packages/adapters/driven/store-supabase/src/health-check.ts";

function clientReturning({ select, rpc }: { select?: unknown; rpc?: unknown } = {}) {
  return {
    from: vi.fn(() => ({ select: vi.fn(() => Promise.resolve(select)) })),
    rpc: vi.fn(() => Promise.resolve(rpc))
  };
}

beforeEach(() => {
  configureSupabase(undefined);
});

describe("checkSupabase", () => {
  it("skips the check when there is no client, so anon mode is not an error", async () => {
    expect(await checkSupabase()).toEqual({ status: "skipped", latencyMs: 0, message: "anon mode" });
  });

  it("reports ok and a latency when the count query answers", async () => {
    configureSupabase(clientReturning({ select: { error: null } }) as never);
    const result = await checkSupabase();
    expect(result.status).toBe("ok");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.message).toBeUndefined();
  });

  it("asks only for the row count, not the rows", async () => {
    const stub = clientReturning({ select: { error: null } });
    configureSupabase(stub as never);
    await checkSupabase();
    expect(stub.from).toHaveBeenCalledWith("tutors-connect-courses");
  });

  it("reports the error message when the query answers with one", async () => {
    configureSupabase(clientReturning({ select: { error: { message: "permission denied" } } }) as never);
    const result = await checkSupabase();
    expect(result).toMatchObject({ status: "error", message: "permission denied" });
  });

  it("reports the message when the query throws an Error", async () => {
    configureSupabase({ from: vi.fn(() => ({ select: () => Promise.reject(new Error("network down")) })) } as never);
    const result = await checkSupabase();
    expect(result).toMatchObject({ status: "error", message: "network down" });
  });

  it("stringifies a thrown value that is not an Error", async () => {
    configureSupabase({ from: vi.fn(() => ({ select: () => Promise.reject("gateway timeout") })) } as never);
    const result = await checkSupabase();
    expect(result).toMatchObject({ status: "error", message: "gateway timeout" });
  });
});

describe("getRecentErrorCounts", () => {
  it("returns nothing when there is no client", async () => {
    expect(await getRecentErrorCounts()).toEqual([]);
  });

  it("returns the counts the function reports", async () => {
    const counts = [{ app: "reader", level: "error", count: 3 }];
    configureSupabase(clientReturning({ rpc: { data: counts, error: null } }) as never);
    expect(await getRecentErrorCounts()).toEqual(counts);
  });

  it("asks for the last hour", async () => {
    const stub = clientReturning({ rpc: { data: [], error: null } });
    configureSupabase(stub as never);
    await getRecentErrorCounts();
    expect(stub.rpc).toHaveBeenCalledWith("get_error_counts", { minutes_ago: 60 });
  });

  it("returns nothing when the function answers with an error", async () => {
    configureSupabase(clientReturning({ rpc: { data: null, error: { message: "no such function" } } }) as never);
    expect(await getRecentErrorCounts()).toEqual([]);
  });

  it("returns nothing when the function answers with no data", async () => {
    configureSupabase(clientReturning({ rpc: { data: null, error: null } }) as never);
    expect(await getRecentErrorCounts()).toEqual([]);
  });

  it("returns nothing when the call throws, so a health page still renders", async () => {
    configureSupabase({ rpc: () => Promise.reject(new Error("socket closed")) } as never);
    expect(await getRecentErrorCounts()).toEqual([]);
  });
});

describe("the readiness check's deadline (Rule 0616)", () => {
  const stalled = () => ({ from: vi.fn(() => ({ select: () => new Promise(() => {}) })), rpc: vi.fn(() => new Promise(() => {})) });

  it("reports an error once Supabase has not answered within HEALTH_CHECK_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    try {
      configureSupabase(stalled() as never);
      const check = checkSupabase();
      await vi.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS);
      expect(await check).toMatchObject({ status: "error", message: `no answer within ${HEALTH_CHECK_TIMEOUT_MS} ms` });
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers no error counts once the counts have not come back in time", async () => {
    vi.useFakeTimers();
    try {
      configureSupabase(stalled() as never);
      const counts = getRecentErrorCounts();
      await vi.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS);
      expect(await counts).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves no timer behind once Supabase has answered", async () => {
    vi.useFakeTimers();
    try {
      configureSupabase(clientReturning({ select: { error: null }, rpc: { data: [], error: null } }) as never);
      await checkSupabase();
      await getRecentErrorCounts();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up before the 3-second readiness probe does", () => {
    expect(HEALTH_CHECK_TIMEOUT_MS).toBeLessThan(3_000);
  });
});

describe("what the readiness check measures and asks", () => {
  it("asks for an exact count of the head only", async () => {
    const select = vi.fn(() => Promise.resolve({ error: null }));
    configureSupabase({ from: vi.fn(() => ({ select })) } as never);
    await checkSupabase();
    expect(select).toHaveBeenCalledWith("count", { count: "exact", head: true });
  });

  it("reports the time the query took, whether it answered or threw", async () => {
    const now = vi.spyOn(performance, "now");
    try {
      now.mockReturnValueOnce(100).mockReturnValueOnce(150);
      configureSupabase(clientReturning({ select: { error: null } }) as never);
      expect((await checkSupabase()).latencyMs).toBe(50);
      now.mockReturnValueOnce(200).mockReturnValueOnce(230);
      configureSupabase({ from: vi.fn(() => ({ select: () => Promise.reject(new Error("network down")) })) } as never);
      expect((await checkSupabase()).latencyMs).toBe(30);
    } finally {
      now.mockRestore();
    }
  });

  it("returns no counts when the function answers with an error, even alongside data", async () => {
    configureSupabase(clientReturning({ rpc: { data: [{ app: "reader", level: "error", count: 3 }], error: { message: "denied" } } }) as never);
    expect(await getRecentErrorCounts()).toEqual([]);
  });
});
