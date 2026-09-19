import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

/**
 * `get_count_learning_records` returns a set of rows. For a learning object a
 * student has never opened, PostgREST answers with an empty array, not null,
 * and indexing into it used to throw "Cannot read properties of undefined
 * (reading 'increment')" as an unhandled rejection on every first visit.
 *
 * The real Supabase client is used; only fetch is stubbed, answering the rpc
 * and recording the update that follows. The client captures fetch when the
 * module loads, so the stub is installed before the import.
 */

const net = vi.hoisted(() => {
  const state = { rpcBody: undefined as unknown, updates: [] as unknown[], original: globalThis.fetch };
  globalThis.fetch = (async (...[input, init]: Parameters<typeof fetch>) => {
    const url = String(input instanceof Request ? input.url : input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/rest/v1/rpc/get_count_learning_records")) return json(state.rpcBody);
    if (url.includes("/rest/v1/learning_records") && init?.method === "PATCH") {
      state.updates.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 204 });
    }
    return json({ message: `unexpected ${init?.method ?? "GET"} ${url}` }, 500);
  }) as typeof fetch;
  return state;
});

vi.mock("$env/dynamic/public", () => ({
  env: {
    PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
    PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
    PUBLIC_ANON_MODE: "FALSE"
  }
}));

import { updateLearningRecordsDuration } from "../../../packages/svelte/community/src/utils/supabase-client.ts";

beforeEach(() => {
  net.updates = [];
});

afterAll(() => {
  globalThis.fetch = net.original;
});

describe("learning record increments", () => {
  it("counts a first visit as 1 when the student has no record yet (empty array)", async () => {
    net.rpcBody = [];
    await expect(updateLearningRecordsDuration("course", "student", "lo")).resolves.toBeUndefined();
    expect(net.updates).toEqual([{ duration: 1 }]);
  });

  it("counts a first visit as 1 when the rpc returns null", async () => {
    net.rpcBody = null;
    await updateLearningRecordsDuration("course", "student", "lo");
    expect(net.updates).toEqual([{ duration: 1 }]);
  });

  it("increments an existing record", async () => {
    net.rpcBody = [{ increment: 4 }];
    await updateLearningRecordsDuration("course", "student", "lo");
    expect(net.updates).toEqual([{ duration: 5 }]);
  });
});
