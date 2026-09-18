import type { LogLevel, LogEntry, Logger, LoggerOptions, RuntimeOptions, Transport } from "./types.ts";
import { formatJson, formatPretty } from "./formatter.ts";

const globalTransports: Transport[] = [];

export function addTransport(fn: Transport): void {
  globalTransports.push(fn);
}

export function removeTransport(fn: Transport): void {
  const idx = globalTransports.indexOf(fn);
  if (idx !== -1) globalTransports.splice(idx, 1);
}

export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CONSOLE_METHOD: Record<LogLevel, "debug" | "info" | "warn" | "error"> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
};

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

function isDev(): boolean {
  try {
    const meta = import.meta as unknown as { env?: { DEV?: boolean } };
    return !!meta.env && meta.env.DEV === true;
  } catch {
    return (
      typeof process !== "undefined" && process.env?.NODE_ENV !== "production"
    );
  }
}

function isServer(): boolean {
  return typeof process !== "undefined" && typeof process.versions?.node === "string";
}

function serverEnv(): Record<string, string | undefined> {
  return isServer() ? process.env : {};
}

/**
 * Resolve the level for the default logger.
 *
 * 1. `LOG_LEVEL` (server only) when it names a valid level, so operators can
 *    tune verbosity per pod without a redeploy.
 * 2. `debug` in dev builds.
 * 3. `info` on the server, so request lifecycle and startup events are visible.
 * 4. `warn` in the browser, keeping the console quiet for end users.
 */
export function resolveLogLevel(options: RuntimeOptions = {}): LogLevel {
  const dev = options.dev ?? isDev();
  const server = options.server ?? isServer();
  const env = options.env ?? (server ? serverEnv() : {});
  const requested = env.LOG_LEVEL?.trim().toLowerCase();
  if (isLogLevel(requested)) return requested;
  if (dev) return "debug";
  return server ? "info" : "warn";
}

/**
 * Fields describing where a log line came from. `hostname` is the pod name
 * under Kubernetes (it sets `HOSTNAME`), `pid` distinguishes workers, and
 * `environment` separates dev noise from production traffic in a collector.
 */
export function runtimeContext(options: RuntimeOptions = {}): Record<string, unknown> {
  const dev = options.dev ?? isDev();
  const server = options.server ?? isServer();
  const context: Record<string, unknown> = {
    environment: dev ? "development" : "production",
  };
  if (server) {
    const env = options.env ?? serverEnv();
    if (env.HOSTNAME) context.hostname = env.HOSTNAME;
    if (typeof process !== "undefined" && typeof process.pid === "number") context.pid = process.pid;
  }
  return context;
}

let globalContext: Record<string, unknown> = {};

/** Merge fields into the context attached to every entry from every logger instance. */
export function setGlobalContext(context: Record<string, unknown>): void {
  globalContext = { ...globalContext, ...context };
}

export function getGlobalContext(): Record<string, unknown> {
  return { ...globalContext };
}

export function clearGlobalContext(): void {
  globalContext = {};
}

/** Tag every entry with the emitting app, e.g. `tutors-reader`. */
export function setAppName(name: string): void {
  setGlobalContext({ app: name });
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return (
    val !== null &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    !(val instanceof Error)
  );
}

/**
 * An error-shaped object (Supabase returns `{ message, code, details, hint }`) carries its
 * text in `message`, which the entry's own `message` would overwrite. Keep it as `error`,
 * the key an Error instance is logged under.
 */
function keepErrorText(context: Record<string, unknown>): Record<string, unknown> {
  if (!("message" in context)) return context;
  const { message, ...rest } = context;
  return "error" in rest ? { ...rest, errorMessage: message } : { ...rest, error: message };
}

function normalizeArgs(args: unknown[]): {
  message: string;
  context: Record<string, unknown>;
} {
  if (typeof args[0] === "string" && args.length === 1) {
    return { message: args[0], context: {} };
  }

  if (typeof args[0] === "string" && args.length >= 2 && isPlainObject(args[1])) {
    return { message: args[0], context: keepErrorText(args[1]) };
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
  readonly level: LogLevel;
  private readonly threshold: number;
  private readonly context: Record<string, unknown>;
  private readonly runtime: Record<string, unknown>;
  private readonly outputFn: (entry: LogEntry) => void;

  constructor(options: LoggerOptions = {}) {
    const dev = isDev();
    this.level = options.level ?? resolveLogLevel({ dev });
    this.threshold = LOG_LEVEL_PRIORITY[this.level];
    this.context = options.context ?? {};
    // Runtime fields only travel with the JSON output; the pretty dev format stays readable.
    this.runtime = dev ? {} : runtimeContext({ dev });
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
      ...globalContext,
      ...this.runtime,
      ...this.context,
      ...callContext,
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    this.outputFn(entry);
    for (const transport of globalTransports) {
      try { transport(entry); } catch { /* transport failures must never crash the app */ }
    }
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
      level: this.level,
      context: { ...this.context, ...context },
      output: this.outputFn,
    });
  }
}

/** The shared logger used by `import log from "@tutors/logger"`. */
export const defaultLogger: Logger = new TutorsLogger();

/**
 * Emit the one startup line operators look for after a deploy: which build is
 * running, on which Node, and at what verbosity. Call it from SvelteKit's
 * server `init` hook.
 */
export function logServiceStart(fields: Record<string, unknown> = {}, logger: Logger = defaultLogger): void {
  const node = typeof process !== "undefined" ? process.version : undefined;
  logger.info("Service starting", { logLevel: logger.level, node, ...fields });
}
