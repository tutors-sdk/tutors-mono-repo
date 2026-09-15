import type { LogLevel, Logger, RequestErrorInput, RequestLikeEvent, RequestLoggerOptions } from "./types.ts";
import { defaultLogger } from "./logger.ts";

const DEFAULT_HEADER = "x-request-id";
const DEFAULT_IGNORE = ["/healthz"];
const DEFAULT_SLOW_MS = 2000;

/** Incoming ids are echoed into logs and headers, so only accept a conservative charset. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

type LocalsWithRequestId = { requestId?: string };

/**
 * Pick the correlation id for a request: the caller's `x-request-id` when it
 * is well formed (an ingress or upstream service already traced it), otherwise
 * a fresh UUID.
 */
export function requestIdFrom(
  headers: { get(name: string): string | null },
  headerName: string = DEFAULT_HEADER,
): string {
  const incoming = headers.get(headerName)?.trim();
  if (incoming && REQUEST_ID_PATTERN.test(incoming)) return incoming;
  return crypto.randomUUID();
}

/** Map a response status (and slowness) to the level a request line is logged at. */
export function levelForStatus(status: number, slow = false): LogLevel {
  if (status >= 500) return "error";
  if (status >= 400 || slow) return "warn";
  return "info";
}

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function requestFields(event: RequestLikeEvent, requestId: string | undefined) {
  return {
    requestId,
    method: event.request.method,
    path: event.url.pathname,
    route: event.route?.id ?? null,
  };
}

/**
 * Build a SvelteKit `handle` hook that logs one line per request with the
 * method, path, matched route, status, duration and a correlation id. The id
 * is stored on `event.locals.requestId` for downstream hooks and endpoints and
 * returned on the response so clients and upstream proxies can quote it.
 *
 * Place it first in `sequence(...)` so it wraps every other hook.
 */
export function createRequestLogger(options: RequestLoggerOptions = {}) {
  const {
    logger = defaultLogger,
    ignorePaths = DEFAULT_IGNORE,
    slowRequestMs = DEFAULT_SLOW_MS,
    headerName = DEFAULT_HEADER,
  } = options;

  return async <E extends RequestLikeEvent>({
    event,
    resolve,
  }: {
    event: E;
    resolve: (event: E) => Response | Promise<Response>;
  }): Promise<Response> => {
    const requestId = requestIdFrom(event.request.headers, headerName);
    (event.locals as LocalsWithRequestId).requestId = requestId;

    const ignored = ignorePaths.some((prefix) => event.url.pathname.startsWith(prefix));
    const start = performance.now();
    const fields = requestFields(event, requestId);

    let response: Response;
    try {
      response = await resolve(event);
    } catch (err) {
      logger.error("request failed", {
        ...fields,
        duration_ms: elapsedMs(start),
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }

    try {
      response.headers.set(headerName, requestId);
    } catch {
      // Some responses (e.g. Response.redirect) carry immutable headers; the log line still has the id.
    }

    if (!ignored) {
      const duration_ms = elapsedMs(start);
      const slow = duration_ms >= slowRequestMs;
      const level = levelForStatus(response.status, slow);
      logger[level]("request completed", {
        ...fields,
        status: response.status,
        duration_ms,
        ...(slow ? { slow: true } : {}),
      });
    }

    return response;
  };
}

/**
 * Log an unhandled server error with the request it belongs to. Use from
 * SvelteKit's `handleError` so the entry carries the same `requestId` as the
 * request line, and the user-facing error page can be matched to it.
 *
 * Returns the request id so callers can surface it to the user.
 */
export function logRequestError(input: RequestErrorInput, logger: Logger = defaultLogger): string | undefined {
  const { error, event, status, message } = input;
  const requestId = event ? (event.locals as LocalsWithRequestId).requestId : undefined;
  const request = event ? requestFields(event, requestId) : { requestId };
  const cause =
    error instanceof Error
      ? { error: error.message, stack: error.stack }
      : { error: String(error), details: error };

  // SvelteKit routes unmatched URLs through handleError as a 404; that is noise, not a fault.
  const level: LogLevel = status === 404 ? "warn" : "error";
  logger[level]("Unhandled server error", { ...request, status, reason: message, ...cause });
  return requestId;
}
