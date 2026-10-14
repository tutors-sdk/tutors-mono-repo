import { currentRequestId } from "./context.ts";

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
