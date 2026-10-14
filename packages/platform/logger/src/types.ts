export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

export interface LoggerOptions {
  level?: LogLevel;
  context?: Record<string, unknown>;
  output?: (entry: LogEntry) => void;
  /**
   * Start every entry with the fixed core key set (`CORE_LOG_KEYS`), null when
   * a value is unknown. Defaults to true on the server outside dev builds.
   */
  structured?: boolean;
}

export type Transport = (entry: LogEntry) => void;

export interface Logger {
  /** The minimum level this logger emits. */
  readonly level: LogLevel;
  debug(message: string, context?: Record<string, unknown>): void;
  debug(...args: unknown[]): void;
  info(message: string, context?: Record<string, unknown>): void;
  info(...args: unknown[]): void;
  warn(message: string, context?: Record<string, unknown>): void;
  warn(...args: unknown[]): void;
  error(message: string, context?: Record<string, unknown>): void;
  error(...args: unknown[]): void;
  child(context: Record<string, unknown>): Logger;
}

/** Inputs that override runtime detection; used by tests and by callers embedding the logger. */
export interface RuntimeOptions {
  /** Environment variables to read (defaults to `process.env` on the server). */
  env?: Record<string, string | undefined>;
  /** Whether this is a dev build (defaults to `import.meta.env.DEV`). */
  dev?: boolean;
  /** Whether this is running under Node (defaults to `process.versions.node` detection). */
  server?: boolean;
}

/** The subset of a SvelteKit `RequestEvent` the request logger reads and writes. */
export interface RequestLikeEvent {
  request: { method: string; headers: { get(name: string): string | null } };
  url: { pathname: string };
  route: { id: string | null };
  locals: object;
}

export interface RequestLoggerOptions {
  /** Logger to emit through. Defaults to the shared default logger. */
  logger?: Logger;
  /** Path prefixes that are never logged, so probes stay out of the log stream. Default `["/healthz"]`. */
  ignorePaths?: string[];
  /** Requests at or above this duration are logged at `warn` with `slow: true`. Default 2000. */
  slowRequestMs?: number;
  /** Correlation header read from the request and echoed on the response. Default `x-request-id`. */
  headerName?: string;
}

/** The arguments SvelteKit passes to `handleError`, typed structurally so the logger has no kit dependency. */
export interface RequestErrorInput {
  error: unknown;
  event?: RequestLikeEvent | null;
  status?: number;
  message?: string;
}
