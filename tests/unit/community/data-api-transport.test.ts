import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("$app/env/public", () => ({ PUBLIC_ANON_MODE: "" }));
vi.mock("@tutors/logger", () => ({ default: { warn } }));

import { dataApi } from "../../../packages/svelte/data-api/src/client.ts";

beforeEach(() => warn.mockClear());
afterEach(() => vi.unstubAllGlobals());

it.each([200, 401, 503, 403, 500])("returns HTTP %s and warns only for unexpected failures", async (status) => {
  const response = new Response(null, { status });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  expect(await dataApi.changeMyStatus({ sentiment: "happy" })).toBe(response);
  if (status === 403 || status === 500) {
    expect(warn).toHaveBeenCalledExactlyOnceWith("Data API call failed", { method: "PATCH", path: "/api/me", status });
  } else {
    expect(warn).not.toHaveBeenCalled();
  }
});

it.each([new Error("offline"), "offline"])("returns null and reports a network failure: %s", async (error) => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
  expect(await dataApi.changeMyStatus({ sentiment: "happy" })).toBeNull();
  expect(warn).toHaveBeenCalledExactlyOnceWith("Data API unreachable", { method: "PATCH", path: "/api/me", error: "offline" });
});
