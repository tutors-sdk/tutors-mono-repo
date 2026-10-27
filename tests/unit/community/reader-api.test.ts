import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("$app/env/public", () => ({ PUBLIC_ANON_MODE: "" }));
vi.mock("@tutors/logger", () => ({ default: { warn } }));

import { readerApi } from "../../../packages/svelte/community/src/utils/reader-api.ts";

beforeEach(() => warn.mockClear());
afterEach(() => vi.unstubAllGlobals());

it.each([200, 401, 503, 403, 500])("returns HTTP %s and warns only for unexpected failures", async (status) => {
  const response = new Response(null, { status });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  expect(await readerApi("GET", "/api/profile")).toBe(response);
  if (status === 403 || status === 500) {
    expect(warn).toHaveBeenCalledExactlyOnceWith("Reader API call failed", { method: "GET", path: "/api/profile", status });
  } else {
    expect(warn).not.toHaveBeenCalled();
  }
});

it.each([new Error("offline"), "offline"])("returns null and reports a network failure: %s", async (error) => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
  expect(await readerApi("GET", "/api/profile")).toBeNull();
  expect(warn).toHaveBeenCalledExactlyOnceWith("Reader API unreachable", { method: "GET", path: "/api/profile", error: "offline" });
});
