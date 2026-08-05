import { describe, it, expect, vi } from "vitest";

/**
 * Logger pattern tests.
 *
 * The logger is a simple utility. These tests validate that the expected
 * console methods exist, message formatting works, and conditional logging
 * respects a severity threshold.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function formatLogMessage(level: LogLevel, message: string, context?: string): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  return context ? `${prefix} [${context}] ${message}` : `${prefix} ${message}`;
}

function shouldLog(messageLevel: LogLevel, threshold: LogLevel): boolean {
  return LOG_LEVELS[messageLevel] >= LOG_LEVELS[threshold];
}

describe("logger: console methods exist", () => {
  it("console.log is a function", () => {
    expect(typeof console.log).toBe("function");
  });

  it("console.warn is a function", () => {
    expect(typeof console.warn).toBe("function");
  });

  it("console.error is a function", () => {
    expect(typeof console.error).toBe("function");
  });

  it("console.debug is a function", () => {
    expect(typeof console.debug).toBe("function");
  });

  it("console.info is a function", () => {
    expect(typeof console.info).toBe("function");
  });
});

describe("logger: log message formatting", () => {
  it("formats a message with level and timestamp", () => {
    const message = formatLogMessage("info", "Server started");
    expect(message).toContain("[INFO]");
    expect(message).toContain("Server started");
  });

  it("includes context when provided", () => {
    const message = formatLogMessage("error", "Connection failed", "database");
    expect(message).toContain("[ERROR]");
    expect(message).toContain("[database]");
    expect(message).toContain("Connection failed");
  });

  it("omits context bracket when no context provided", () => {
    const message = formatLogMessage("warn", "Deprecated API");
    expect(message).not.toContain("[]");
    expect(message).toContain("[WARN]");
  });
});

describe("logger: conditional logging by threshold", () => {
  it("logs when message level equals threshold", () => {
    expect(shouldLog("warn", "warn")).toBe(true);
  });

  it("logs when message level exceeds threshold", () => {
    expect(shouldLog("error", "warn")).toBe(true);
  });

  it("does not log when message level is below threshold", () => {
    expect(shouldLog("debug", "warn")).toBe(false);
    expect(shouldLog("info", "warn")).toBe(false);
  });

  it("debug threshold allows all levels", () => {
    expect(shouldLog("debug", "debug")).toBe(true);
    expect(shouldLog("info", "debug")).toBe(true);
    expect(shouldLog("warn", "debug")).toBe(true);
    expect(shouldLog("error", "debug")).toBe(true);
  });

  it("error threshold only allows error", () => {
    expect(shouldLog("debug", "error")).toBe(false);
    expect(shouldLog("info", "error")).toBe(false);
    expect(shouldLog("warn", "error")).toBe(false);
    expect(shouldLog("error", "error")).toBe(true);
  });
});
