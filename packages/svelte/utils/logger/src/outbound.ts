import { currentRequestId } from "@tutors/logger-core";

type FetchLike = typeof fetch;

/**
 * Wrap `fetch` so calls made while a request is being served carry that
 * request's id in `x-request-id`, letting an upstream's logs be joined to
 * ours. Outside a request (startup, timers) and in the browser, where there is
 * no ambient request and an extra header would force a CORS preflight, the
 * call is passed through untouched. A header the caller set is never replaced.
 */
export function withRequestId(fetchImpl: FetchLike = fetch, headerName = "x-request-id"): FetchLike {
  return (input, init) => {
    const requestId = currentRequestId();
    if (!requestId) return fetchImpl(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has(headerName)) headers.set(headerName, requestId);
    return fetchImpl(input, { ...init, headers });
  };
}

/** How long a call to a dependency (Supabase, a course host) may take before it is abandoned: Rules 0614-0616. */
export const OUTBOUND_TIMEOUT_MS = 10_000;

/**
 * Wrap `fetch` so a call that has not finished within `timeoutMs` is aborted with a `TimeoutError`, instead of holding
 * the page, the server route or the readiness probe that made it for as long as the dependency stalls. The deadline
 * covers the body too, since a host can send headers and then stall. A signal the caller passed still aborts the call.
 * The timer is a plain `setTimeout` (unref'd on the server), so it never keeps a process alive and fake timers drive it.
 */
export function withTimeout(fetchImpl: FetchLike = fetch, timeoutMs: number = OUTBOUND_TIMEOUT_MS): FetchLike {
  return (input, init) => {
    const deadline = new AbortController();
    const timer: { unref?: () => void } = setTimeout(() => deadline.abort(new DOMException(`no answer within ${timeoutMs} ms`, "TimeoutError")), timeoutMs);
    timer.unref?.();
    const callers = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = callers ? AbortSignal.any([callers, deadline.signal]) : deadline.signal;
    return fetchImpl(input, { ...init, signal });
  };
}
