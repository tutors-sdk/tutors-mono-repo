import { Registry, collectDefaultMetrics, Histogram, Counter, Gauge } from "@prometheus-io/client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry]
});

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [metricsRegistry]
});

export const httpRequestsInFlight = new Gauge({
  name: "http_requests_in_flight",
  help: "Number of HTTP requests currently being processed",
  registers: [metricsRegistry]
});

/**
 * The label set the request SLIs start with: an unmatched GET answered 404, a series real traffic
 * (scanners, mistyped URLs) produces anyway, so priming it adds no label set the app would not have.
 */
const PRIMED_REQUEST_LABELS = { method: "GET", route: "unmatched", status_code: "404" } as const;

/**
 * Expose the availability SLI (http_requests_total) and the latency SLI (every
 * http_request_duration_seconds bucket) at zero, so /metrics carries both from the first scrape.
 * A labelled series is otherwise absent until its first request, and an app that has served none
 * (time, between lecturers' visits) would read as uninstrumented rather than idle (Rule 0574).
 */
function primeRequestSlis(): void {
  httpRequestsTotal.inc(PRIMED_REQUEST_LABELS, 0);
  httpRequestDuration.zero(PRIMED_REQUEST_LABELS);
}

primeRequestSlis();
