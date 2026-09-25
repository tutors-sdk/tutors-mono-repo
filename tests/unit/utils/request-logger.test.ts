import { describe, it, expect } from "vitest";
import {
  createLogger,
  createRequestLogger,
  logRequestError,
  requestIdFrom,
  levelForStatus,
} from "../../../packages/svelte/utils/logger/src/index.ts";
import type { LogEntry } from "../../../packages/svelte/utils/logger/src/types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function capture() {
  const entries: LogEntry[] = [];
  const logger = createLogger({ level: "debug", output: (entry) => entries.push(entry) });
  return { logger, entries };
}

function makeEvent(init: { method?: string; path?: string; headers?: Record<string, string>; routeId?: string | null } = {}) {
  const { method = "GET", path = "/course/cs101", headers = {}, routeId = "/course/[courseid]" } = init;
  const url = new URL(`http://localhost${path}`);
  return {
    request: new Request(url, { method, headers }),
    url,
    route: { id: routeId },
    locals: {} as { requestId?: string },
  };
}

const respond = (status = 200) => async () => new Response("body", { status });

describe("request logger: completion line", () => {
  it("logs method, path, route, status and duration once per request", async () => {
    const { logger, entries } = capture();
    const handle = createRequestLogger({ logger });
    const event = makeEvent({ method: "POST", path: "/api/notes", routeId: "/api/notes" });

    const response = await handle({ event, resolve: respond(201) });

    expect(response.status).toBe(201);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "info",
      message: "request completed",
      method: "POST",
      path: "/api/notes",
      route: "/api/notes",
      status: 201,
    });
    expect(typeof entries[0].duration_ms).toBe("number");
    expect(entries[0].slow).toBe(false);
  });

  it("logs 4xx at warn and 5xx at error", async () => {
    const { logger, entries } = capture();
    const handle = createRequestLogger({ logger });
    await handle({ event: makeEvent(), resolve: respond(404) });
    await handle({ event: makeEvent(), resolve: respond(503) });
    expect(entries.map((e) => e.level)).toEqual(["warn", "error"]);
  });

  it("flags slow requests at warn", async () => {
    const { logger, entries } = capture();
    const handle = createRequestLogger({ logger, slowRequestMs: 0 });
    await handle({ event: makeEvent(), resolve: respond(200) });
    expect(entries[0].level).toBe("warn");
    expect(entries[0].slow).toBe(true);
  });

  it("records a failure with duration and rethrows when resolve throws", async () => {
    const { logger, entries } = capture();
    const handle = createRequestLogger({ logger });
    const boom = new Error("db down");

    await expect(handle({ event: makeEvent(), resolve: async () => { throw boom; } })).rejects.toBe(boom);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: "error", message: "request failed", error: "db down", path: "/course/cs101" });
    expect(typeof entries[0].duration_ms).toBe("number");
    expect(entries[0].stack).toBeDefined();
  });
});

describe("request logger: failures SvelteKit answers with a 200", () => {
  const failingLoad = (status: number, responseStatus = 200) => async (event: ReturnType<typeof makeEvent>) => {
    logRequestError({ error: new Error("load threw"), event, status, message: "Internal Error" }, capture().logger);
    return new Response("{}", { status: responseStatus });
  };

  it("marks the completion line with loadError and logs it at error", async () => {
    const { logger, entries } = capture();
    const handle = createRequestLogger({ logger });

    const response = await handle({ event: makeEvent({ path: "/course/cs101/__data.json" }), resolve: failingLoad(500) });

    expect(response.status).toBe(200);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: "error", message: "request completed", status: 200, loadError: true });
  });

  it("leaves a response that is already 5xx unmarked", async () => {
    const { logger, entries } = capture();
    await createRequestLogger({ logger })({ event: makeEvent(), resolve: failingLoad(500, 500) });
    expect(entries[0]).toMatchObject({ level: "error", status: 500 });
    expect(entries[0].loadError).toBe(false);
  });

  it("does not treat an unmatched route (404 through handleError) as a load error", async () => {
    const { logger, entries } = capture();
    await createRequestLogger({ logger })({ event: makeEvent({ routeId: null }), resolve: failingLoad(404, 404) });
    expect(entries[0]).toMatchObject({ level: "warn", status: 404 });
    expect(entries[0].loadError).toBe(false);
  });

  it("keeps successful requests unmarked", async () => {
    const { logger, entries } = capture();
    await createRequestLogger({ logger })({ event: makeEvent(), resolve: respond(200) });
    expect(entries[0]).toMatchObject({ level: "info", status: 200 });
    expect(entries[0].loadError).toBe(false);
  });
});

describe("request logger: correlation id", () => {
  it("generates a UUID and returns it in the response header and locals", async () => {
    const { logger, entries } = capture();
    const handle = createRequestLogger({ logger });
    const event = makeEvent();

    const response = await handle({ event, resolve: respond() });

    const id = response.headers.get("x-request-id");
    expect(id).toMatch(UUID);
    expect(event.locals.requestId).toBe(id);
    expect(entries[0].requestId).toBe(id);
  });

  it("propagates a well-formed incoming x-request-id", async () => {
    const { logger, entries } = capture();
    const handle = createRequestLogger({ logger });
    const event = makeEvent({ headers: { "x-request-id": "ingress-42.abc" } });

    const response = await handle({ event, resolve: respond() });

    expect(response.headers.get("x-request-id")).toBe("ingress-42.abc");
    expect(event.locals.requestId).toBe("ingress-42.abc");
    expect(entries[0].requestId).toBe("ingress-42.abc");
  });

  it("replaces a malformed incoming id rather than echoing it", async () => {
    const { logger } = capture();
    const handle = createRequestLogger({ logger });
    const event = makeEvent({ headers: { "x-request-id": "not a valid id <script>" } });

    const response = await handle({ event, resolve: respond() });

    expect(response.headers.get("x-request-id")).toMatch(UUID);
  });

  it("honours a custom header name", async () => {
    const { logger } = capture();
    const handle = createRequestLogger({ logger, headerName: "x-correlation-id" });
    const event = makeEvent({ headers: { "x-correlation-id": "corr-1" } });

    const response = await handle({ event, resolve: respond() });

    expect(response.headers.get("x-correlation-id")).toBe("corr-1");
    expect(response.headers.get("x-request-id")).toBeNull();
  });

  it("tolerates responses with immutable headers", async () => {
    const { logger, entries } = capture();
    const handle = createRequestLogger({ logger });

    const response = await handle({ event: makeEvent(), resolve: async () => Response.redirect("http://localhost/next", 302) });

    expect(response.status).toBe(302);
    expect(entries[0].status).toBe(302);
    expect(entries[0].requestId).toMatch(UUID);
  });
});

describe("request logger: ignored paths", () => {
  it("does not log probe traffic but still tags it", async () => {
    const { logger, entries } = capture();
    const handle = createRequestLogger({ logger });
    const event = makeEvent({ path: "/healthz/live", routeId: "/healthz/live" });

    const response = await handle({ event, resolve: respond() });

    expect(entries).toHaveLength(0);
    expect(response.headers.get("x-request-id")).toMatch(UUID);
    expect(event.locals.requestId).toMatch(UUID);
  });

  it("accepts custom prefixes", async () => {
    const { logger, entries } = capture();
    const handle = createRequestLogger({ logger, ignorePaths: ["/metrics"] });
    await handle({ event: makeEvent({ path: "/metrics" }), resolve: respond() });
    await handle({ event: makeEvent({ path: "/healthz" }), resolve: respond() });
    expect(entries.map((e) => e.path)).toEqual(["/healthz"]);
  });
});

describe("requestIdFrom", () => {
  it("accepts ids made of letters, digits, dots, colons, dashes and underscores", () => {
    expect(requestIdFrom(new Headers({ "x-request-id": "a-b_c.d:e" }))).toBe("a-b_c.d:e");
  });

  it("rejects ids longer than 128 characters", () => {
    expect(requestIdFrom(new Headers({ "x-request-id": "x".repeat(129) }))).toMatch(UUID);
  });

  it("rejects blank ids", () => {
    expect(requestIdFrom(new Headers({ "x-request-id": "   " }))).toMatch(UUID);
  });
});

describe("levelForStatus", () => {
  it("maps status ranges to levels", () => {
    expect(levelForStatus(200)).toBe("info");
    expect(levelForStatus(302)).toBe("info");
    expect(levelForStatus(400)).toBe("warn");
    expect(levelForStatus(499)).toBe("warn");
    expect(levelForStatus(500)).toBe("error");
  });

  it("promotes slow successes to warn but never demotes errors", () => {
    expect(levelForStatus(200, true)).toBe("warn");
    expect(levelForStatus(500, true)).toBe("error");
  });
});

describe("logRequestError", () => {
  it("logs the error with the request fields from handleError", () => {
    const { logger, entries } = capture();
    const event = makeEvent({ method: "GET", path: "/course/broken" });
    event.locals.requestId = "req-1";

    const id = logRequestError({ error: new Error("boom"), event, status: 500, message: "Internal Error" }, logger);

    expect(id).toBe("req-1");
    expect(entries[0]).toMatchObject({
      level: "error",
      message: "Unhandled server error",
      requestId: "req-1",
      method: "GET",
      path: "/course/broken",
      route: "/course/[courseid]",
      status: 500,
      reason: "Internal Error",
      error: "boom",
    });
    expect(entries[0].stack).toBeDefined();
  });

  it("keeps the highest error status on locals for the completion line", () => {
    const { logger } = capture();
    const event = makeEvent() as ReturnType<typeof makeEvent> & { locals: { requestErrorStatus?: number } };

    logRequestError({ error: new Error("first"), event, status: 500 }, logger);
    logRequestError({ error: new Error("second"), event, status: 404 }, logger);
    expect(event.locals.requestErrorStatus).toBe(500);

    const unknownStatus = makeEvent() as typeof event;
    logRequestError({ error: new Error("no status"), event: unknownStatus }, logger);
    expect(unknownStatus.locals.requestErrorStatus).toBe(500);
  });

  it("logs unmatched routes at warn instead of error", () => {
    const { logger, entries } = capture();
    logRequestError({ error: new Error("Not found"), event: makeEvent({ path: "/nope", routeId: null }), status: 404, message: "Not Found" }, logger);
    expect(entries[0].level).toBe("warn");
    expect(entries[0].route).toBeNull();
  });

  it("serialises non-Error values", () => {
    const { logger, entries } = capture();
    logRequestError({ error: { code: "PGRST116", message: "row missing" }, event: makeEvent() }, logger);
    expect(entries[0].error).toBe('{"code":"PGRST116","message":"row missing"}');
    expect(entries[0].stack).toBeNull();
  });

  it("works without an event", () => {
    const { logger, entries } = capture();
    const id = logRequestError({ error: new Error("early") }, logger);
    expect(id).toBeUndefined();
    expect(entries[0].error).toBe("early");
    expect(entries[0]).toMatchObject({ requestId: null, method: null, path: null, route: null });
  });
});
