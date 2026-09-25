import type { Handle } from "@sveltejs/kit";
import { httpRequestDuration, httpRequestsTotal, httpRequestsInFlight } from "./metrics.ts";

/** Scraped or probed continuously; instrumenting them would only add noise. */
const IGNORED_PATHS: ReadonlySet<string> = new Set(["/metrics", "/healthz", "/healthz/live"]);

/**
 * SvelteKit `handle` hook that records one histogram observation and one
 * counter increment per request, labelled by method, matched route and
 * status. Place it right after the request logger in `sequence(...)` so it
 * also times failures inside later hooks.
 *
 * The route label is the matched route id, never the raw path: unmatched
 * requests (404 probes, scanners) collapse into a single `unmatched` series
 * instead of creating one time series per unique URL.
 */
export const metricsHandle: Handle = async ({ event, resolve }) => {
  if (IGNORED_PATHS.has(event.url.pathname)) return resolve(event);

  const route = event.route?.id ?? "unmatched";
  const method = event.request.method;
  const start = performance.now();
  httpRequestsInFlight.inc();

  // A throw from resolve() becomes a 500 in SvelteKit's error handling, so
  // record it as such rather than dropping the sample.
  let status = 500;
  try {
    const response = await resolve(event);
    status = response.status;
    return response;
  } finally {
    httpRequestsInFlight.dec();
    const labels = { method, route, status_code: String(status) };
    httpRequestDuration.observe(labels, (performance.now() - start) / 1000);
    httpRequestsTotal.inc(labels);
  }
};
