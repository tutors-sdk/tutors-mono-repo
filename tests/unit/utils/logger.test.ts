import { describe, it, expect, afterEach } from "vitest";
import { createLogger, addTransport, removeTransport } from "../../../packages/svelte/utils/logger/src/index.ts";
import type { LogEntry } from "../../../packages/svelte/utils/logger/src/types.ts";
import {
  formatJson,
  formatPretty,
} from "../../../packages/svelte/utils/logger/src/formatter.ts";

function createTestLogger(overrides: Record<string, unknown> = {}) {
  const entries: LogEntry[] = [];
  const logger = createLogger({
    level: "debug",
    output: (entry: LogEntry) => entries.push(entry),
    ...overrides,
  });
  return { logger, entries };
}

describe("logger: basic output", () => {
  it("emits a log entry with timestamp, level, and message", () => {
    const { logger, entries } = createTestLogger();
    logger.info("hello");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveProperty("timestamp");
    expect(entries[0].level).toBe("info");
    expect(entries[0].message).toBe("hello");
  });

  it("debug/info/warn/error each set the correct level field", () => {
    const { logger, entries } = createTestLogger();
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(entries.map((e) => e.level)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
    ]);
  });

  it("includes ISO 8601 timestamp", () => {
    const { logger, entries } = createTestLogger();
    logger.info("test");
    expect(entries[0].timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });
});

describe("logger: argument normalization", () => {
  it("handles (string) — single message", () => {
    const { logger, entries } = createTestLogger();
    logger.info("simple message");
    expect(entries[0].message).toBe("simple message");
  });

  it("handles (string, plainObject) — message + context", () => {
    const { logger, entries } = createTestLogger();
    logger.info("loaded", { courseId: "cs101", duration: 42 });
    expect(entries[0].message).toBe("loaded");
    expect(entries[0].courseId).toBe("cs101");
    expect(entries[0].duration).toBe(42);
  });

  it("handles (string, Error) — message + error serialization", () => {
    const { logger, entries } = createTestLogger();
    const err = new Error("boom");
    logger.error("failed:", err);
    expect(entries[0].message).toBe("failed:");
    expect(entries[0].error).toBe("boom");
    expect(entries[0].stack).toBeDefined();
  });

  it("handles (Error) — error as sole argument", () => {
    const { logger, entries } = createTestLogger();
    const err = new Error("something broke");
    logger.error(err);
    expect(entries[0].message).toBe("something broke");
    expect(entries[0].error).toBe("something broke");
  });

  it("handles (string, primitive) — non-object second arg goes to details", () => {
    const { logger, entries } = createTestLogger();
    logger.warn("No type found for icon", "talk");
    expect(entries[0].message).toBe("No type found for icon");
    expect(entries[0].details).toBe("talk");
  });

  it("handles (string, supabaseError) — plain object with code/message", () => {
    const { logger, entries } = createTestLogger();
    logger.error("Error fetching row:", {
      code: "PGRST116",
      message: "DB error",
    });
    expect(entries[0].message).toBe("Error fetching row:");
    expect(entries[0].code).toBe("PGRST116");
  });
});

describe("logger: level filtering", () => {
  it("suppresses debug when level is warn", () => {
    const { logger, entries } = createTestLogger({ level: "warn" });
    logger.debug("should not appear");
    expect(entries).toHaveLength(0);
  });

  it("suppresses info when level is warn", () => {
    const { logger, entries } = createTestLogger({ level: "warn" });
    logger.info("should not appear");
    expect(entries).toHaveLength(0);
  });

  it("emits warn when level is warn", () => {
    const { logger, entries } = createTestLogger({ level: "warn" });
    logger.warn("visible");
    expect(entries).toHaveLength(1);
  });

  it("emits error when level is warn", () => {
    const { logger, entries } = createTestLogger({ level: "warn" });
    logger.error("visible");
    expect(entries).toHaveLength(1);
  });

  it("debug level allows all messages", () => {
    const { logger, entries } = createTestLogger({ level: "debug" });
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(entries).toHaveLength(4);
  });

  it("error level only allows error", () => {
    const { logger, entries } = createTestLogger({ level: "error" });
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("error");
  });
});

describe("logger: context enrichment", () => {
  it("includes static context from construction in every entry", () => {
    const { logger, entries } = createTestLogger({
      context: { app: "reader", module: "courses" },
    });
    logger.info("test");
    expect(entries[0].app).toBe("reader");
    expect(entries[0].module).toBe("courses");
  });

  it("merges call-site context with static context", () => {
    const { logger, entries } = createTestLogger({
      context: { app: "reader" },
    });
    logger.info("loaded", { courseId: "cs101" });
    expect(entries[0].app).toBe("reader");
    expect(entries[0].courseId).toBe("cs101");
  });

  it("call-site context overrides static context on conflict", () => {
    const { logger, entries } = createTestLogger({
      context: { app: "reader" },
    });
    logger.info("override", { app: "catalogue" });
    expect(entries[0].app).toBe("catalogue");
  });
});

describe("logger: child loggers", () => {
  it("child inherits parent context", () => {
    const { logger, entries } = createTestLogger({
      context: { app: "reader" },
    });
    const child = logger.child({ module: "auth" });
    child.info("test");
    expect(entries[0].app).toBe("reader");
    expect(entries[0].module).toBe("auth");
  });

  it("child adds its own context", () => {
    const { logger, entries } = createTestLogger();
    const child = logger.child({ requestId: "abc-123" });
    child.info("test");
    expect(entries[0].requestId).toBe("abc-123");
  });

  it("child does not mutate parent context", () => {
    const { logger, entries } = createTestLogger({
      context: { app: "reader" },
    });
    logger.child({ module: "auth" });
    logger.info("parent");
    expect(entries[0]).not.toHaveProperty("module");
  });

  it("grandchild inherits through the chain", () => {
    const { logger, entries } = createTestLogger({
      context: { app: "reader" },
    });
    const child = logger.child({ module: "auth" });
    const grandchild = child.child({ userId: "u42" });
    grandchild.info("deep");
    expect(entries[0].app).toBe("reader");
    expect(entries[0].module).toBe("auth");
    expect(entries[0].userId).toBe("u42");
  });

  it("child with correlationId produces entries with that ID", () => {
    const { logger, entries } = createTestLogger();
    const correlated = logger.child({ correlationId: "req-abc" });
    correlated.info("start");
    correlated.info("end");
    expect(entries[0].correlationId).toBe("req-abc");
    expect(entries[1].correlationId).toBe("req-abc");
  });
});

describe("logger: createLogger factory", () => {
  it("creates independent logger instances", () => {
    const entries1: LogEntry[] = [];
    const entries2: LogEntry[] = [];
    const log1 = createLogger({
      level: "debug",
      output: (e) => entries1.push(e),
    });
    const log2 = createLogger({
      level: "debug",
      output: (e) => entries2.push(e),
    });
    log1.info("one");
    log2.info("two");
    expect(entries1).toHaveLength(1);
    expect(entries2).toHaveLength(1);
    expect(entries1[0].message).toBe("one");
    expect(entries2[0].message).toBe("two");
  });

  it("accepts app and module context", () => {
    const entries: LogEntry[] = [];
    const log = createLogger({
      level: "debug",
      context: { app: "tutors-reader", module: "course-loader" },
      output: (e) => entries.push(e),
    });
    log.info("Course loaded", { courseId: "cs101" });
    expect(entries[0].app).toBe("tutors-reader");
    expect(entries[0].module).toBe("course-loader");
    expect(entries[0].courseId).toBe("cs101");
  });
});

describe("logger: backwards compatibility", () => {
  it("default export has error, warn, info, debug methods", async () => {
    const mod = await import(
      "../../../packages/svelte/utils/logger/src/index.ts"
    );
    const log = mod.default;
    expect(typeof log.error).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.debug).toBe("function");
  });

  it("default export has child method", async () => {
    const mod = await import(
      "../../../packages/svelte/utils/logger/src/index.ts"
    );
    expect(typeof mod.default.child).toBe("function");
  });

  it("default export is callable with existing patterns", () => {
    const { logger, entries } = createTestLogger();
    logger.error("Error fetching row:", { code: "ERR", message: "fail" });
    logger.error(new Error("oops"));
    logger.debug(`Total courses: ${42}`);
    logger.warn("No type found for icon", "talk");
    expect(entries).toHaveLength(4);
  });
});

describe("logger: global transports", () => {
  const transportEntries: LogEntry[] = [];
  const transport = (entry: LogEntry) => transportEntries.push(entry);

  afterEach(() => {
    removeTransport(transport);
    transportEntries.length = 0;
  });

  it("addTransport receives entries from all logger instances", () => {
    addTransport(transport);
    const { logger } = createTestLogger();
    logger.error("boom");
    expect(transportEntries).toHaveLength(1);
    expect(transportEntries[0].message).toBe("boom");
  });

  it("transport receives entries from child loggers", () => {
    addTransport(transport);
    const { logger } = createTestLogger({ context: { app: "reader" } });
    const child = logger.child({ module: "auth" });
    child.warn("session expired");
    expect(transportEntries).toHaveLength(1);
    expect(transportEntries[0].app).toBe("reader");
    expect(transportEntries[0].module).toBe("auth");
  });

  it("removeTransport stops delivery", () => {
    addTransport(transport);
    const { logger } = createTestLogger();
    logger.error("first");
    removeTransport(transport);
    logger.error("second");
    expect(transportEntries).toHaveLength(1);
  });

  it("transport errors do not crash the logger", () => {
    const badTransport = () => { throw new Error("transport failure"); };
    addTransport(badTransport);
    const { logger, entries } = createTestLogger();
    expect(() => logger.error("still works")).not.toThrow();
    expect(entries).toHaveLength(1);
    removeTransport(badTransport);
  });

  it("respects level filtering before reaching transports", () => {
    addTransport(transport);
    const { logger } = createTestLogger({ level: "error" });
    logger.debug("suppressed");
    logger.error("visible");
    expect(transportEntries).toHaveLength(1);
    expect(transportEntries[0].level).toBe("error");
  });
});

describe("formatter: formatJson", () => {
  it("produces valid JSON", () => {
    const entry: LogEntry = {
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "info",
      message: "test",
    };
    const result = formatJson(entry);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("includes all entry fields", () => {
    const entry: LogEntry = {
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "error",
      message: "fail",
      app: "reader",
    };
    const parsed = JSON.parse(formatJson(entry));
    expect(parsed.timestamp).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("fail");
    expect(parsed.app).toBe("reader");
  });
});

describe("formatter: formatPretty", () => {
  it("includes [tutors:level] prefix", () => {
    const entry: LogEntry = {
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "error",
      message: "test",
    };
    expect(formatPretty(entry)).toContain("[tutors:error]");
  });

  it("omits context block when context is empty", () => {
    const entry: LogEntry = {
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "info",
      message: "clean",
    };
    const result = formatPretty(entry);
    expect(result).toBe("[2026-01-01T00:00:00.000Z] [tutors:info] clean");
  });

  it("includes context as JSON when present", () => {
    const entry: LogEntry = {
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "info",
      message: "loaded",
      courseId: "cs101",
    };
    const result = formatPretty(entry);
    expect(result).toContain('{"courseId":"cs101"}');
  });
});
