import type { LogLevel, LogEntry, Logger, LoggerOptions } from "./types.ts";
import { formatJson, formatPretty } from "./formatter.ts";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_FROM_PRIORITY = Object.fromEntries(
  Object.entries(LOG_LEVEL_PRIORITY).map(([k, v]) => [v, k as LogLevel]),
);

const CONSOLE_METHOD: Record<LogLevel, "debug" | "info" | "warn" | "error"> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
};

function isDev(): boolean {
  try {
    const meta = import.meta as unknown as Record<string, unknown>;
    return !!meta.env &&
      (meta as unknown as { env: { DEV?: boolean } }).env.DEV === true;
  } catch {
    return (
      typeof process !== "undefined" && process.env?.NODE_ENV !== "production"
    );
  }
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return (
    val !== null &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    !(val instanceof Error)
  );
}

function normalizeArgs(args: unknown[]): {
  message: string;
  context: Record<string, unknown>;
} {
  if (typeof args[0] === "string" && args.length === 1) {
    return { message: args[0], context: {} };
  }

  if (typeof args[0] === "string" && args.length >= 2 && isPlainObject(args[1])) {
    return { message: args[0], context: args[1] };
  }

  if (typeof args[0] === "string" && args.length >= 2 && args[1] instanceof Error) {
    return {
      message: args[0],
      context: { error: args[1].message, stack: args[1].stack },
    };
  }

  if (typeof args[0] === "string" && args.length >= 2) {
    return {
      message: args[0],
      context: { details: args.length === 2 ? args[1] : args.slice(1) },
    };
  }

  if (args[0] instanceof Error) {
    return {
      message: args[0].message,
      context: { error: args[0].message, stack: args[0].stack },
    };
  }

  return {
    message: String(args[0]),
    context: args.length > 1 ? { details: args.slice(1) } : {},
  };
}

export class TutorsLogger implements Logger {
  private readonly threshold: number;
  private readonly context: Record<string, unknown>;
  private readonly outputFn: (entry: LogEntry) => void;

  constructor(options: LoggerOptions = {}) {
    const dev = isDev();
    const level = options.level ?? (dev ? "debug" : "warn");
    this.threshold = LOG_LEVEL_PRIORITY[level];
    this.context = options.context ?? {};
    this.outputFn = options.output ?? TutorsLogger.defaultOutput(dev);
  }

  private static defaultOutput(dev: boolean): (entry: LogEntry) => void {
    const format = dev ? formatPretty : formatJson;
    return (entry: LogEntry) => {
      const method = CONSOLE_METHOD[entry.level as LogLevel];
      console[method](format(entry));
    };
  }

  private log(level: LogLevel, args: unknown[]): void {
    if (LOG_LEVEL_PRIORITY[level] < this.threshold) return;

    const { message, context: callContext } = normalizeArgs(args);
    const entry: LogEntry = {
      ...this.context,
      ...callContext,
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    this.outputFn(entry);
  }

  debug(...args: unknown[]): void {
    this.log("debug", args);
  }

  info(...args: unknown[]): void {
    this.log("info", args);
  }

  warn(...args: unknown[]): void {
    this.log("warn", args);
  }

  error(...args: unknown[]): void {
    this.log("error", args);
  }

  child(context: Record<string, unknown>): Logger {
    return new TutorsLogger({
      level: LEVEL_FROM_PRIORITY[this.threshold] as LogLevel,
      context: { ...this.context, ...context },
      output: this.outputFn,
    });
  }
}
