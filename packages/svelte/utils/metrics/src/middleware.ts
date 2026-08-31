import type { Handle } from "@sveltejs/kit";
import { httpRequestDuration, httpRequestsTotal, httpRequestsInFlight } from "./metrics.ts";

export const metricsHandle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname === "/metrics" || event.url.pathname === "/healthz" || event.url.pathname === "/healthz/live") {
    return resolve(event);
  }

  const start = performance.now();
  httpRequestsInFlight.inc();

  try {
    const response = await resolve(event);
    const duration = (performance.now() - start) / 1000;
    const route = event.route.id ?? event.url.pathname;

    httpRequestDuration.observe({ method: event.request.method, route, status_code: response.status }, duration);
    httpRequestsTotal.inc({ method: event.request.method, route, status_code: response.status });

    return response;
  } finally {
    httpRequestsInFlight.dec();
  }
};
