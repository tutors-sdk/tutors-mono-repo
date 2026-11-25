import { expect, it, vi } from "vitest";

vi.mock("../../../apps/validator/node_modules/@sveltejs/kit/src/exports/hooks/index.js", () => ({
  sequence:
    (...handles: Array<(input: { event: unknown; resolve: (event: unknown) => unknown }) => unknown>) =>
    ({ event, resolve }: { event: unknown; resolve: (event: unknown) => unknown }) =>
      handles.reduceRight<(event: unknown) => unknown>((next, handle) => (event) => handle({ event, resolve: next }), resolve)(event)
}));
vi.mock("$app/env", () => ({ building: true }));
vi.mock("@tutors/logger", () => ({
  createRequestLogger:
    () =>
    async ({ event, resolve }: { event: unknown; resolve: (event: unknown) => Promise<Response> }) =>
      resolve(event),
  installProcessLogging: vi.fn(),
  logRequestError: vi.fn(),
  logServiceStart: vi.fn(),
  setAppName: vi.fn()
}));
vi.mock("@tutors/metrics", () => ({
  metricsHandle: async ({ event, resolve }: { event: unknown; resolve: (event: unknown) => Promise<Response> }) => resolve(event),
  metricsEndpoint: async () => new Response("metrics")
}));

import { handle, handleError, init } from "../../../apps/validator/src/hooks.server.ts";
import { handleError as clientError } from "../../../apps/validator/src/hooks.client.ts";
import { GET as readiness } from "../../../apps/validator/src/routes/healthz/+server.ts";
import { GET as liveness } from "../../../apps/validator/src/routes/healthz/live/+server.ts";
import { GET as metrics } from "../../../apps/validator/src/routes/metrics/+server.ts";
import { GET as version } from "../../../apps/validator/src/routes/version/+server.ts";
import { logRequestError, logServiceStart } from "@tutors/logger";

it("serves validation without a database or authentication dependency", async () => {
  const response = await readiness({} as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok", app: "tutors-validator" });
  expect(await (await liveness({} as never)).json()).toEqual({ status: "ok" });
});

it("applies the response-header contract without unsafe-eval", async () => {
  const response = await handle({ event: {}, resolve: async () => new Response("ok") } as never);
  expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  expect(response.headers.get("Content-Security-Policy")).toContain("worker-src 'self' blob:");
  expect(response.headers.get("Content-Security-Policy")).not.toContain("unsafe-eval");
});

it("reports build identity, process metrics and startup through the shared app seams", async () => {
  vi.stubGlobal("APP_VERSION", "17.1.0");
  try {
    await init();
    expect(logServiceStart).toHaveBeenCalledWith({ version: "17.1.0" });
    expect(await (await version({} as never)).json()).toMatchObject({ app: "tutors-validator", version: "17.1.0" });
    expect(await (await metrics({ request: new Request("http://validator.test/metrics") } as never)).text()).toBe("metrics");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("keeps client failures generic and reports only unexpected server failures", () => {
  expect(clientError({} as never)).toEqual({ status: 500, message: "An unexpected error occurred" });
  expect(handleError({ kind: "known" } as never)).toBeUndefined();
  expect(handleError({ kind: "unknown", error: new Error("failure"), event: {} } as never)).toMatchObject({ status: 500 });
  expect(logRequestError).toHaveBeenCalledOnce();
});
