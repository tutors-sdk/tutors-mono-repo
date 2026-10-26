import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addTransport,
  clearGlobalContext,
  createLogger,
  getGlobalContext,
  isLogLevel,
  removeTransport,
  resolveLogLevel,
  runtimeContext,
  useCliOutput,
  type LogEntry,
} from "../../../packages/jsr/logger-core/src/index.ts";
import { formatCli, formatPretty } from "../../../packages/jsr/logger-core/src/formatter.ts";

/** What @tutors/logger-core adds for the Deno packages (issue #210): the CLI format, CLI output and the Deno env guard. */

const entry = (fields: Record<string, unknown>): LogEntry => ({ timestamp: "t", level: "warn", message: "m", ...fields });

describe("formatCli", () => {
  it("falls back to tutors when app is missing, empty or not a string", () => {
    expect(formatCli(entry({}))).toBe("tutors warn: m");
    expect(formatCli(entry({ app: "" }))).toBe("tutors warn: m");
    expect(formatCli(entry({ app: 7 }))).toBe("tutors warn: m");
    expect(formatCli(entry({ app: "x" }))).toBe("x warn: m");
  });

  it("adds the error only when it is a non-empty string that differs from the message", () => {
    expect(formatCli(entry({ error: "boom" }))).toBe("tutors warn: m: boom");
    expect(formatCli(entry({ error: "" }))).toBe("tutors warn: m");
    expect(formatCli(entry({ error: "m" }))).toBe("tutors warn: m");
    expect(formatCli(entry({ error: 42 }))).toBe("tutors warn: m");
  });

  it("hides runtime and core keys, drops null and undefined values and stringifies the rest", () => {
    const hidden = { event: "log", environment: "production", hostname: "h", pid: 1, requestId: "r", stack: "s" };
    expect(formatCli(entry({ ...hidden }))).toBe("tutors warn: m");
    expect(formatCli(entry({ a: null, b: undefined }))).toBe("tutors warn: m");
    expect(formatCli(entry({ n: 0, o: { k: 1 }, s: "" }))).toBe('tutors warn: m (n=0, o={"k":1}, s=)');
  });
});

describe("formatPretty scope", () => {
  it("falls back to tutors for an empty app", () => {
    expect(formatPretty(entry({ app: "" }))).toBe("[t] [tutors:warn] m");
    expect(formatPretty(entry({ app: "a" }))).toBe("[t] [a:warn] m");
  });
});

describe("useCliOutput", () => {
  afterEach(() => {
    useCliOutput(false);
    clearGlobalContext();
    vi.restoreAllMocks();
  });

  function warnLine(): string {
    const lines: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    createLogger({ level: "debug", structured: false }).warn("hello", { path: "p" });
    expect(lines).toHaveLength(1);
    return lines[0];
  }

  it("switches console output to one CLI line and tags entries with the tool", () => {
    useCliOutput("tutors-gen");
    expect(getGlobalContext()).toEqual({ app: "tutors-gen" });
    expect(warnLine()).toBe("tutors-gen warn: hello (path=p)");
  });

  it("false switches back to the JSON or pretty format and sets no app", () => {
    useCliOutput("tutors-gen");
    useCliOutput(false);
    clearGlobalContext();
    useCliOutput(false);
    expect(getGlobalContext()).toEqual({});
    expect(warnLine()).not.toMatch(/^tutors(-gen)? warn: hello/);
  });

  it("an explicit output is left alone", () => {
    useCliOutput("tutors");
    const entries: LogEntry[] = [];
    createLogger({ level: "debug", output: (e) => entries.push(e) }).warn("x");
    expect(entries[0]).toMatchObject({ message: "x", app: "tutors" });
  });
});

describe("environment under Deno", () => {
  const deno = globalThis as { Deno?: unknown };

  afterEach(() => {
    delete deno.Deno;
    vi.unstubAllEnvs();
  });

  function withPermission(state: string | (() => never)) {
    deno.Deno = {
      permissions: {
        querySync: () => (typeof state === "function" ? state() : { state }),
      },
    };
  }

  it("reads LOG_LEVEL and HOSTNAME when env access is granted", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    vi.stubEnv("HOSTNAME", "pod-1");
    withPermission("granted");
    expect(resolveLogLevel({ dev: false, server: true })).toBe("error");
    expect(runtimeContext({ dev: false, server: true }).hostname).toBe("pod-1");
  });

  it("treats the environment as empty when env access is not granted", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    vi.stubEnv("HOSTNAME", "pod-1");
    withPermission("prompt");
    expect(resolveLogLevel({ dev: false, server: true })).toBe("info");
    expect(runtimeContext({ dev: false, server: true }).hostname).toBeUndefined();
  });

  it("treats the environment as empty when the permission query throws", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    withPermission(() => {
      throw new Error("NotCapable");
    });
    expect(resolveLogLevel({ dev: false, server: true })).toBe("info");
  });

  it("reads the environment under Node, where there is no Deno global", () => {
    vi.stubEnv("LOG_LEVEL", "debug");
    expect(resolveLogLevel({ dev: false, server: true })).toBe("debug");
    expect(runtimeContext({ dev: false, server: true }).pid).toBe(process.pid);
  });
});

describe("argument normalisation and transports", () => {
  function capture() {
    const entries: LogEntry[] = [];
    const logger = createLogger({ level: "debug", structured: false, output: (e) => entries.push(e) });
    return { logger, entries };
  }

  it("keeps a string message with an Error as error and stack", () => {
    const { logger, entries } = capture();
    logger.error("failed", new Error("boom"));
    expect(entries[0]).toMatchObject({ message: "failed", error: "boom", stack: expect.any(String) });
  });

  it("puts one extra value in details as is, and several as an array", () => {
    const { logger, entries } = capture();
    logger.info("one", 5);
    logger.info("many", 5, 6);
    expect(entries[0].details).toBe(5);
    expect(entries[1].details).toEqual([5, 6]);
  });

  it("uses an Error's message when the Error comes first", () => {
    const { logger, entries } = capture();
    logger.error(new Error("first"));
    expect(entries[0]).toMatchObject({ message: "first", error: "first" });
  });

  it("stringifies a non-string first argument and keeps the rest as details", () => {
    const { logger, entries } = capture();
    logger.info(42);
    logger.info(42, "a", "b");
    expect(entries[0].message).toBe("42");
    expect(entries[0]).not.toHaveProperty("details");
    expect(entries[1]).toMatchObject({ message: "42", details: ["a", "b"] });
  });

  it("removing a transport that was never added leaves the others", () => {
    const seen: string[] = [];
    const kept = (e: LogEntry) => seen.push(e.message);
    addTransport(kept);
    removeTransport(() => {});
    capture().logger.info("still here");
    removeTransport(kept);
    capture().logger.info("gone");
    expect(seen).toEqual(["still here"]);
  });

  it("isLogLevel rejects non-strings and unknown names", () => {
    expect(isLogLevel("warn")).toBe(true);
    expect(isLogLevel("verbose")).toBe(false);
    expect(isLogLevel(1)).toBe(false);
  });
});
