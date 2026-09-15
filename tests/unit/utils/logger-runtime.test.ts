import { describe, it, expect, afterEach } from "vitest";
import {
  createLogger,
  resolveLogLevel,
  runtimeContext,
  setAppName,
  setGlobalContext,
  getGlobalContext,
  clearGlobalContext,
  isLogLevel,
  LOG_LEVELS,
  logServiceStart,
} from "../../../packages/svelte/utils/logger/src/index.ts";
import type { LogEntry } from "../../../packages/svelte/utils/logger/src/types.ts";
import { formatPretty } from "../../../packages/svelte/utils/logger/src/formatter.ts";

function capture(overrides: Record<string, unknown> = {}) {
  const entries: LogEntry[] = [];
  const logger = createLogger({
    level: "debug",
    output: (entry: LogEntry) => entries.push(entry),
    ...overrides,
  });
  return { logger, entries };
}

describe("logger: level resolution", () => {
  it("honours a valid LOG_LEVEL on the server", () => {
    expect(resolveLogLevel({ env: { LOG_LEVEL: "debug" }, dev: false, server: true })).toBe("debug");
    expect(resolveLogLevel({ env: { LOG_LEVEL: "error" }, dev: false, server: true })).toBe("error");
  });

  it("trims and lower-cases LOG_LEVEL", () => {
    expect(resolveLogLevel({ env: { LOG_LEVEL: "  WARN " }, dev: false, server: true })).toBe("warn");
  });

  it("ignores an unknown LOG_LEVEL and falls back to the default", () => {
    expect(resolveLogLevel({ env: { LOG_LEVEL: "verbose" }, dev: false, server: true })).toBe("info");
    expect(resolveLogLevel({ env: { LOG_LEVEL: "" }, dev: true, server: true })).toBe("debug");
  });

  it("LOG_LEVEL overrides the dev default", () => {
    expect(resolveLogLevel({ env: { LOG_LEVEL: "error" }, dev: true, server: true })).toBe("error");
  });

  it("defaults to debug in dev builds", () => {
    expect(resolveLogLevel({ env: {}, dev: true, server: true })).toBe("debug");
    expect(resolveLogLevel({ env: {}, dev: true, server: false })).toBe("debug");
  });

  it("defaults to info on a production server so request lines are visible", () => {
    expect(resolveLogLevel({ env: {}, dev: false, server: true })).toBe("info");
  });

  it("defaults to warn in a production browser", () => {
    expect(resolveLogLevel({ env: {}, dev: false, server: false })).toBe("warn");
  });

  it("exposes the known levels and a guard", () => {
    expect(LOG_LEVELS).toEqual(["debug", "info", "warn", "error"]);
    expect(isLogLevel("info")).toBe(true);
    expect(isLogLevel("INFO")).toBe(false);
    expect(isLogLevel(undefined)).toBe(false);
    expect(isLogLevel(3)).toBe(false);
  });

  it("a logger reports its level and children inherit it", () => {
    const { logger } = capture({ level: "warn" });
    expect(logger.level).toBe("warn");
    expect(logger.child({ module: "x" }).level).toBe("warn");
  });
});

describe("logger: runtime context", () => {
  it("on a production server includes hostname, pid and environment", () => {
    const ctx = runtimeContext({ dev: false, server: true, env: { HOSTNAME: "reader-7d9f-abc12" } });
    expect(ctx.hostname).toBe("reader-7d9f-abc12");
    expect(typeof ctx.pid).toBe("number");
    expect(ctx.environment).toBe("production");
  });

  it("omits hostname when HOSTNAME is unset", () => {
    const ctx = runtimeContext({ dev: false, server: true, env: {} });
    expect(ctx).not.toHaveProperty("hostname");
    expect(typeof ctx.pid).toBe("number");
  });

  it("in the browser carries only the environment", () => {
    expect(runtimeContext({ dev: false, server: false })).toEqual({ environment: "production" });
  });

  it("reports development in dev builds", () => {
    expect(runtimeContext({ dev: true, server: false })).toEqual({ environment: "development" });
  });
});

describe("logger: global context", () => {
  afterEach(() => clearGlobalContext());

  it("setAppName tags every entry with the app", () => {
    setAppName("tutors-reader");
    const { logger, entries } = capture();
    logger.info("hello");
    expect(entries[0].app).toBe("tutors-reader");
  });

  it("applies to loggers created before it was set and to their children", () => {
    const { logger, entries } = capture();
    setGlobalContext({ region: "eu-west" });
    logger.child({ module: "auth" }).info("x");
    expect(entries[0].region).toBe("eu-west");
    expect(entries[0].module).toBe("auth");
  });

  it("merges successive calls", () => {
    setGlobalContext({ a: 1 });
    setGlobalContext({ b: 2 });
    expect(getGlobalContext()).toEqual({ a: 1, b: 2 });
  });

  it("is overridden by instance and call-site context", () => {
    setAppName("tutors-reader");
    const { logger, entries } = capture({ context: { app: "instance" } });
    logger.info("one");
    logger.info("two", { app: "call" });
    expect(entries[0].app).toBe("instance");
    expect(entries[1].app).toBe("call");
  });

  it("clearGlobalContext removes it from new entries", () => {
    setAppName("tutors-reader");
    clearGlobalContext();
    const { logger, entries } = capture();
    logger.info("x");
    expect(entries[0]).not.toHaveProperty("app");
  });

  it("getGlobalContext returns a copy", () => {
    setGlobalContext({ a: 1 });
    const copy = getGlobalContext();
    copy.a = 2;
    expect(getGlobalContext().a).toBe(1);
  });
});

describe("logger: logServiceStart", () => {
  it("emits one info line with the effective level and caller fields", () => {
    const { logger, entries } = capture({ level: "info" });
    logServiceStart({ version: "16.1.8" }, logger);
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("info");
    expect(entries[0].message).toBe("Service starting");
    expect(entries[0].logLevel).toBe("info");
    expect(entries[0].version).toBe("16.1.8");
    expect(String(entries[0].node)).toMatch(/^v\d+/);
  });
});

describe("formatter: app scope", () => {
  it("uses the app name as the prefix scope and keeps it out of the context block", () => {
    const line = formatPretty({
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "info",
      message: "loaded",
      app: "tutors-reader",
      courseId: "cs101",
    });
    expect(line).toBe('[2026-01-01T00:00:00.000Z] [tutors-reader:info] loaded {"courseId":"cs101"}');
  });
});
