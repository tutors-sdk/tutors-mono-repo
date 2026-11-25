import type { Logger } from "@tutors/logger-core";

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
