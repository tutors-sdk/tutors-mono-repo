import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const logs = vi.hoisted(() => ({ error: vi.fn(), request: vi.fn() }));
vi.mock("$app/env", () => ({ building: true }));
vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock("$env/dynamic/public", () => ({ env: {} }));
vi.mock("@tutors/logger", () => ({
  default: { error: logs.error }, logRequestError: logs.request,
  setAppName: vi.fn(), addTransport: vi.fn(), createRequestLogger: vi.fn(),
  installProcessLogging: vi.fn(), logServiceStart: vi.fn()
}));
vi.mock("../../../packages/svelte/community/src/utils/error-transport.ts", () => ({ createSupabaseErrorTransport: vi.fn() }));
vi.mock("@tutors/tutors-time-lib", () => ({ initSupabase: vi.fn() }));
vi.mock("../../../packages/svelte/course/src/course/index.ts", () => ({ setCourseNotFoundHandler: vi.fn(), setCourseUnreachableHandler: vi.fn() }));
vi.mock("../../../packages/svelte/utils/i18n/src/index.ts", () => ({ initLocaleFromCookie: vi.fn() }));
vi.mock("../../../apps/reader/node_modules/@sveltejs/kit/src/exports/hooks/index.js", () => ({ sequence: vi.fn() }));

beforeAll(() => vi.stubGlobal("window", { addEventListener: vi.fn() }));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => vi.clearAllMocks());

describe.each(["reader", "catalogue", "live", "time"])("%s error hooks", (app) => {
  it.each(["server", "client"])("%s preserves expected errors and reports unknown failures", async (side) => {
    const { handleError } = await import(`../../../apps/${app}/src/hooks.${side}.ts`);
    for (const kind of side === "server" ? ["app", "framework", "validation"] : ["app", "framework"]) {
      expect(await handleError({ kind, error: { status: 404, message: "Course not found" }, event: {} })).toBeUndefined();
    }
    expect(logs.error).not.toHaveBeenCalled();
    expect(logs.request).not.toHaveBeenCalled();
    const error = new Error("private internal detail");
    expect(await handleError({ kind: "unknown", error, event: {} })).toEqual({ status: 500, message: "An unexpected error occurred" });
    expect(side === "server" ? logs.request : logs.error).toHaveBeenCalledTimes(1);
  });
});
