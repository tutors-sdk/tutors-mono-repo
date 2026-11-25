/**
 * Public entry point of @tutors/metrics: the shared Prometheus registry, the SvelteKit handle that records
 * request metrics, and the /metrics endpoint (guarded by METRICS_TOKEN when it is set).
 */
export { metricsRegistry, httpRequestDuration, httpRequestsTotal, httpRequestsInFlight } from "./metrics.ts";
export { metricsHandle } from "./middleware.ts";
export { metricsEndpoint, type MetricsEndpointOptions } from "./endpoint.ts";
