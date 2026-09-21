import type { LogLevel, Logger, RequestErrorInput, RequestLikeEvent, RequestLoggerOptions } from "./types.ts";
import { defaultLogger } from "./logger.ts";
import { runWithRequestContext } from "./context.ts";
import { serializeError } from "./errors.ts";

/** The one correlation header: read from the request, set once on the response, forwarded on outbound calls. */
export const REQUEST_ID_HEADER = "x-request-id";
const DEFAULT_HEADER = REQUEST_ID_HEADER;
const DEFAULT_IGNORE = ["/healthz"];
const DEFAULT_SLOW_MS = 2000;

/** Incoming ids are echoed into logs and headers, so only accept a conservative charset. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

type LocalsWithRequestId = {
  requestId?: string;
  /** Highest status `logRequestError` saw for this request; read back by the completion line. */
  requestErrorStatus?: number;
};

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

/** Same four keys whether or not the request is known, so the line's key set never changes. */
function requestFields(event: RequestLikeEvent | null | undefined, requestId: string | undefined) {
  return {
    requestId: requestId ?? null,
    method: event?.request.method ?? null,
    path: event?.url.pathname ?? null,
    route: event?.route?.id ?? null,
  };
}

/** Copy a response whose headers are immutable (`Response.redirect`, a fetched response) so the id can be set. */
function withHeader(response: Response, name: string, value: string): Response {
  try {
    response.headers.set(name, value);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set(name, value);
    return copy;
  }
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
      // Everything resolve() awaits logs with this request id, without it being passed around.
      response = await runWithRequestContext({ requestId }, () => resolve(event));
    } catch (err) {
      logger.error("request failed", {
        event: "request.failed",
        ...fields,
        duration_ms: elapsedMs(start),
        ...serializeError(err),
      });
      throw err;
    }

    response = withHeader(response, headerName, requestId);

    if (!ignored) {
      const duration_ms = elapsedMs(start);
      const slow = duration_ms >= slowRequestMs;
      // SvelteKit answers a `__data.json` request whose server load threw with a 200
      // carrying an error node. handleError still saw the 500, so the line records it.
      const errorStatus = (event.locals as LocalsWithRequestId).requestErrorStatus;
      const loadError = errorStatus !== undefined && errorStatus >= 500 && response.status < 500;
      const level = levelForStatus(loadError ? errorStatus : response.status, slow);
      // `slow` and `loadError` are always present: a key that only appears on a bad day
      // changes the line's shape, which log pipelines and the release harness compare.
      logger[level]("request completed", {
        event: "request.completed",
        ...fields,
        status: response.status,
        duration_ms,
        slow,
        loadError,
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
 * The status is also kept on `event.locals`, so the request logger's
 * completion line can mark a failure SvelteKit answered with a 200
 * (`loadError: true`).
 *
 * Returns the request id so callers can surface it to the user.
 */
export function logRequestError(input: RequestErrorInput, logger: Logger = defaultLogger): string | undefined {
  const { error, event, status, message } = input;
  const locals = event ? (event.locals as LocalsWithRequestId) : undefined;
  if (locals) locals.requestErrorStatus = Math.max(locals.requestErrorStatus ?? 0, status ?? 500);
  const requestId = locals?.requestId;
  const request = requestFields(event, requestId);

  // SvelteKit routes unmatched URLs through handleError as a 404; that is noise, not a fault.
  const level: LogLevel = status === 404 ? "warn" : "error";
  logger[level]("Unhandled server error", {
    event: "request.error",
    ...request,
    status: status ?? null,
    reason: message ?? null,
    ...serializeError(error),
  });
  return requestId;
}
