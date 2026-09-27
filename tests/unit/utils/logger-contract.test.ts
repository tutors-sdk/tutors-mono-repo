import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CORE_LOG_KEYS,
  LOG_EVENT_FIELDS,
  clearGlobalContext,
  createLogger,
  createRequestLogger,
  currentRequestId,
  installProcessLogging,
  logRequestError,
  logServiceStart,
  runWithRequestContext,
  safeStringify,
  serializeError,
  setAppName,
  withRequestId,
  type LogEntry
} from "../../../packages/svelte/utils/logger/src/index.ts";
import { formatJson } from "../../../packages/svelte/utils/logger/src/formatter.ts";

/** A structured logger (the server production shape) that captures entries. */
function capture() {
  const entries: LogEntry[] = [];
  return { entries, logger: createLogger({ level: "debug", structured: true, output: (entry) => entries.push(entry) }) };
}

function makeEvent(path = "/course/cs101", headers: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`);
  return { request: new Request(url, { headers }), url, route: { id: "/course/[courseid]" }, locals: {} };
}

const keysAfterCore = (entry: LogEntry) => Object.keys(entry).slice(CORE_LOG_KEYS.length);

afterEach(() => clearGlobalContext());

describe("log contract: core keys", () => {
  it("every structured entry starts with the core keys, in order, null when unknown", () => {
    const { entries, logger } = capture();
    logger.info("plain");
    logger.warn("with context", { courseId: "cs101" });
    logger.error("with error", new Error("boom"));
    logger.child({ module: "x" }).debug("child");
    for (const entry of entries) {
      expect(Object.keys(entry).slice(0, CORE_LOG_KEYS.length)).toEqual([...CORE_LOG_KEYS]);
    }
    expect(entries[0]).toMatchObject({ event: "log", app: null, requestId: null, environment: expect.any(String) });
    expect(keysAfterCore(entries[1])).toEqual(["courseId"]);
    expect(keysAfterCore(entries[3])).toEqual(["module"]);
  });

  it("call-site context cannot reorder or drop a core key, and undefined values keep their key", () => {
    const { entries, logger } = capture();
    setAppName("tutors-reader");
    logger.info("x", { requestId: "r1", zeta: undefined, app: "tutors-override" });
    expect(Object.keys(entries[0])).toEqual([...CORE_LOG_KEYS, "zeta"]);
    expect(entries[0]).toMatchObject({ app: "tutors-override", requestId: "r1", zeta: null });
  });

  it("unstructured loggers (dev, browser) keep the light shape", () => {
    const entries: LogEntry[] = [];
    createLogger({ level: "debug", structured: false, output: (e) => entries.push(e) }).info("hello");
    expect(entries[0]).not.toHaveProperty("event");
    expect(entries[0]).not.toHaveProperty("requestId");
  });
});

describe("log contract: event kinds", () => {
  it("lifecycle events carry exactly their documented fields, in order", async () => {
    const { entries, logger } = capture();
    logServiceStart({ version: "1.2.3" }, logger);
    const handle = createRequestLogger({ logger });
    await handle({ event: makeEvent(), resolve: async () => new Response("ok") });
    logRequestError({ error: new Error("x"), event: makeEvent(), status: 500, message: "Internal Error" }, logger);
    logRequestError({ error: "just a string" }, logger);
    await expect(
      handle({
        event: makeEvent(),
        resolve: async () => {
          throw new Error("hook exploded");
        }
      })
    ).rejects.toThrow("hook exploded");

    expect(entries.map((e) => e.event)).toEqual(["service.start", "request.completed", "request.error", "request.error", "request.failed"]);
    for (const entry of entries) {
      expect(keysAfterCore(entry)).toEqual([...LOG_EVENT_FIELDS[entry.event as string].required]);
    }
    expect(entries[3]).toMatchObject({ requestId: null, method: null, path: null, route: null, status: null, reason: null, stack: null });
  });

  it("a fast and a slow completion line have the same keys", async () => {
    const { entries, logger } = capture();
    await createRequestLogger({ logger })({ event: makeEvent(), resolve: async () => new Response("ok") });
    await createRequestLogger({ logger, slowRequestMs: 0 })({ event: makeEvent(), resolve: async () => new Response("ok") });
    expect(Object.keys(entries[0])).toEqual(Object.keys(entries[1]));
    expect([entries[0].slow, entries[1].slow]).toEqual([false, true]);
  });
});

describe("log contract: one line per entry", () => {
  it("serialises an error with a multi-line stack into a single line", () => {
    const { entries, logger } = capture();
    logger.error("failed", new Error("line one\nline two"));
    const line = formatJson(entries[0]);
    expect(line).not.toMatch(/[\r\n]/);
    const parsed = JSON.parse(line);
    expect(parsed.error).toBe("line one\nline two");
    expect(parsed.stack).toContain("\n    at ");
  });

  it("serializeError always yields { error, stack } and never throws", () => {
    expect(Object.keys(serializeError(new Error("x")))).toEqual(["error", "stack"]);
    expect(serializeError("text")).toEqual({ error: "text", stack: null });
    expect(serializeError({ code: 1 })).toEqual({ error: '{"code":1}', stack: null });
    expect(serializeError(undefined)).toEqual({ error: "undefined", stack: null });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serializeError(circular)).toEqual({ error: '{"self":"[Circular]"}', stack: null });
  });

  it("formatJson survives circular context, BigInt and nested errors", () => {
    const circular: Record<string, unknown> = { n: 10n, cause: new Error("inner") };
    circular.self = circular;
    const parsed = JSON.parse(safeStringify({ message: "x", circular }));
    expect(parsed.circular).toMatchObject({ n: "10", self: "[Circular]", cause: { message: "inner" } });
  });
});

describe("request context", () => {
  it("lines logged while a request is being served carry its id without it being passed", async () => {
    const { entries, logger } = capture();
    const handle = createRequestLogger({ logger });
    const response = await handle({
      event: makeEvent("/course/cs101", { "x-request-id": "ctx-1" }),
      resolve: async () => {
        await new Promise((r) => setTimeout(r, 1));
        logger.warn("from deep inside a load");
        return new Response("ok");
      }
    });
    logger.info("after the request");
    expect(response.headers.get("x-request-id")).toBe("ctx-1");
    expect(entries.map((e) => e.requestId)).toEqual(["ctx-1", "ctx-1", null]);
  });

  it("concurrent requests do not leak ids into each other", async () => {
    const { entries, logger } = capture();
    const handle = createRequestLogger({ logger });
    const serve = (id: string, delay: number) =>
      handle({
        event: makeEvent("/", { "x-request-id": id }),
        resolve: async () => {
          await new Promise((r) => setTimeout(r, delay));
          logger.info(`work ${id}`);
          return new Response("ok");
        }
      });
    await Promise.all([serve("a", 5), serve("b", 1)]);
    for (const entry of entries.filter((e) => e.message.startsWith("work "))) {
      expect(entry.requestId).toBe(entry.message.slice(5));
    }
  });

  it("sets the header on a response with immutable headers by copying it", async () => {
    const { logger } = capture();
    const response = await createRequestLogger({ logger })({
      event: makeEvent("/", { "x-request-id": "imm-1" }),
      resolve: async () => Response.redirect("http://localhost/elsewhere", 302)
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost/elsewhere");
    expect(response.headers.get("x-request-id")).toBe("imm-1");
  });

  it("withRequestId forwards the id on outbound fetches inside a request, and only there", async () => {
    const seen: (string | null)[] = [];
    const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      seen.push(new Headers(init?.headers).get("x-request-id"));
      return new Response("ok");
    });
    const outbound = withRequestId(fetchImpl);
    await outbound("https://example.test/a");
    await runWithRequestContext({ requestId: "out-1" }, async () => {
      expect(currentRequestId()).toBe("out-1");
      await outbound("https://example.test/b", { headers: { apikey: "k" } });
      await outbound("https://example.test/c", { headers: { "x-request-id": "callers-own" } });
    });
    expect(seen).toEqual([null, "out-1", "callers-own"]);
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).get("apikey")).toBe("k");
  });
});

describe("installProcessLogging", () => {
  function harness() {
    const { entries, logger } = capture();
    const listeners: Record<string, ((arg: unknown) => void)[]> = {};
    const removed: string[] = [];
    const exits: number[] = [];
    const target = {
      on: (event: string, listener: (arg: unknown) => void) => void (listeners[event] ??= []).push(listener),
      removeAllListeners: (event: string) => void removed.push(event),
      exit: (code?: number) => void exits.push(code ?? 0)
    };
    const written: string[] = [];
    const write = (...args: unknown[]) => void written.push(args.join(" "));
    const fakeConsole = { log: write, info: write, debug: write, warn: write, error: write, trace: write };
    const installed = installProcessLogging({ logger, force: true, target: target as never, console: fakeConsole });
    return { entries, listeners, removed, exits, written, fakeConsole, installed, target, logger };
  }

  it("re-emits stray console output as one structured entry, multi-line text included", () => {
    const h = harness();
    expect(h.installed).toBe(true);
    h.fakeConsole.log("Listening on http://0.0.0.0:3000");
    h.fakeConsole.warn("stray\nline", { a: 1 });
    expect(h.written).toEqual([]);
    expect(h.entries).toHaveLength(2);
    expect(h.entries[0]).toMatchObject({ level: "info", event: "console", message: "Listening on http://0.0.0.0:3000", consoleMethod: "log" });
    expect(h.entries[1]).toMatchObject({ level: "warn", event: "console", consoleMethod: "warn" });
    expect(h.entries[1].message).toContain("stray\nline");
    expect(formatJson(h.entries[1])).not.toMatch(/[\r\n]/);
    for (const entry of h.entries) expect(keysAfterCore(entry)).toEqual([...LOG_EVENT_FIELDS.console.required]);
  });

  it("logs an uncaught exception and an unhandled rejection with a stack, then exits 1", () => {
    const h = harness();
    h.listeners.uncaughtException[0](new Error("kaboom"));
    h.listeners.unhandledRejection[0]("rejected with a string");
    expect(h.exits).toEqual([1, 1]);
    expect(h.entries.map((e) => [e.level, e.event, e.error])).toEqual([
      ["error", "process.uncaughtException", "kaboom"],
      ["error", "process.unhandledRejection", "rejected with a string"]
    ]);
    expect(h.entries[0].stack).toContain("kaboom");
    expect(h.entries[1].stack).toBeNull();
    for (const entry of h.entries) expect(keysAfterCore(entry)).toEqual([...LOG_EVENT_FIELDS[entry.event as string].required]);
  });

  it("replaces Node's plain-text warning printer", () => {
    const h = harness();
    expect(h.removed).toEqual(["warning"]);
    const warning = Object.assign(new Error("fs.Stats is deprecated"), { name: "DeprecationWarning" });
    h.listeners.warning[0](warning);
    expect(h.entries[0]).toMatchObject({ level: "warn", event: "process.warning", warningName: "DeprecationWarning" });
    expect(keysAfterCore(h.entries[0])).toEqual([...LOG_EVENT_FIELDS["process.warning"].required]);
  });

  it("is idempotent per process, and a no-op unless forced in a dev build", () => {
    const h = harness();
    expect(installProcessLogging({ logger: h.logger, force: true, target: h.target as never, console: h.fakeConsole })).toBe(false);
    // vitest runs with import.meta.env.DEV === true
    expect(installProcessLogging({ target: { on() {}, removeAllListeners() {}, exit() {} }, console: h.fakeConsole })).toBe(false);
  });
});
