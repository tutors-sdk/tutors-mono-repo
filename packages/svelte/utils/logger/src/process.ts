import type { Logger, LogLevel } from "./types.ts";
import { defaultLogger, setRawConsole } from "./logger.ts";
import { safeStringify, serializeError } from "./errors.ts";

type ConsoleMethod = "log" | "info" | "debug" | "warn" | "error" | "trace";

/** `console.log` has no level of its own; it is what libraries use for banners, so it maps to info. */
const CONSOLE_LEVEL: Record<ConsoleMethod, LogLevel> = {
  log: "info",
  info: "info",
  debug: "debug",
  warn: "warn",
  error: "error",
  trace: "debug",
};

type ConsoleLike = Record<ConsoleMethod, (...args: unknown[]) => void>;

interface ProcessLike {
  on(event: string, listener: (...args: never[]) => void): unknown;
  removeAllListeners(event: string): unknown;
  exit(code?: number): void;
}

export interface ProcessLoggingOptions {
  /** Logger to emit through. Defaults to the shared default logger. */
  logger?: Logger;
  /** Install even in a dev build or outside Node. Tests use this; apps should not. */
  force?: boolean;
  /** The process to attach handlers to. Defaults to the global `process`. */
  target?: ProcessLike;
  /** The console to wrap. Defaults to the global `console`. */
  console?: ConsoleLike;
}

const INSTALLED = Symbol.for("tutors.logger.processLogging");

function isDevBuild(): boolean {
  try {
    const meta = import.meta as unknown as { env?: { DEV?: boolean } };
    return !!meta.env && meta.env.DEV === true;
  } catch {
    return false;
  }
}

/** Render console arguments the way Node would (`util.format`), falling back to a plain join. */
function formatConsoleArgs(args: unknown[]): string {
  try {
    const lookup = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    const util = lookup?.call(process, "node:util") as { format?: (...args: unknown[]) => string } | undefined;
    if (util?.format) return util.format(...args);
  } catch {
    // fall through
  }
  return args
    .map((arg) => (typeof arg === "string" ? arg : arg instanceof Error ? (arg.stack ?? arg.message) : safeStringify(arg)))
    .join(" ");
}

/**
 * Make the logger the only thing that writes to stdout and stderr, so every
 * line a container emits is one JSON object:
 *
 * - `console.*` calls from code that does not use the logger (dependencies,
 *   adapter-node's "Listening on ..." banner, published Tutors libraries) are
 *   re-emitted as `event: "console"` entries, multi-line text included.
 * - `uncaughtException` and `unhandledRejection` are logged with their stack
 *   as `process.uncaughtException` / `process.unhandledRejection`, then the
 *   process exits with code 1, as Node would have done after printing a
 *   plain-text trace.
 * - Node process warnings (deprecations, experimental features) are logged as
 *   `process.warning` instead of Node's two-line plain-text form.
 *
 * Call it once at the top of `hooks.server.ts`. It does nothing in dev builds
 * (the pretty format is for people) or outside Node, and installing twice is
 * harmless. What it cannot cover is documented in deploy/README.md: output
 * written before the server module loads, and V8's own fatal errors.
 */
export function installProcessLogging(options: ProcessLoggingOptions = {}): boolean {
  const onServer = typeof process !== "undefined" && typeof process.versions?.node === "string";
  if (!options.force && (!onServer || isDevBuild())) return false;

  const target = options.target ?? (process as unknown as ProcessLike);
  const targetConsole = options.console ?? (console as unknown as ConsoleLike);
  const flags = target as unknown as Record<symbol, boolean>;
  if (flags[INSTALLED]) return false;
  flags[INSTALLED] = true;

  const logger = options.logger ?? defaultLogger;

  const original = {} as ConsoleLike;
  for (const method of Object.keys(CONSOLE_LEVEL) as ConsoleMethod[]) {
    original[method] = targetConsole[method].bind(targetConsole);
  }
  // Only the real console feeds the default output; a console injected by a test is none of its business.
  if (targetConsole === (console as unknown as ConsoleLike)) {
    setRawConsole({
      debug: original.debug,
      info: original.info,
      warn: original.warn,
      error: original.error,
    });
  }

  let capturing = false;
  for (const method of Object.keys(CONSOLE_LEVEL) as ConsoleMethod[]) {
    targetConsole[method] = (...args: unknown[]) => {
      // A logger output that itself used console would otherwise recurse.
      if (capturing) return original[method](...args);
      capturing = true;
      try {
        logger[CONSOLE_LEVEL[method]](formatConsoleArgs(args), { event: "console", consoleMethod: method });
      } finally {
        capturing = false;
      }
    };
  }

  const fatal = (event: string, message: string) => (thrown: unknown) => {
    try {
      logger.error(message, { event, ...serializeError(thrown) });
    } finally {
      target.exit(1);
    }
  };
  target.on("uncaughtException", fatal("process.uncaughtException", "Uncaught exception") as never);
  target.on("unhandledRejection", fatal("process.unhandledRejection", "Unhandled promise rejection") as never);

  // Node prints warnings from its own listener; replace it rather than add to it.
  target.removeAllListeners("warning");
  target.on("warning", ((warning: Error) => {
    logger.warn("Node process warning", {
      event: "process.warning",
      warningName: warning?.name ?? null,
      ...serializeError(warning),
    });
  }) as never);

  return true;
}
