import { metricsRegistry } from "./metrics.ts";

export interface MetricsEndpointOptions {
  /** The incoming request; only its `Authorization` header is read. */
  request?: Request;
  /** Environment to read `METRICS_TOKEN` from. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
}

function serverEnv(): Record<string, string | undefined> {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

/** Compare without short-circuiting on the first differing byte. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Serve the shared registry in Prometheus text exposition format.
 *
 * The endpoint listens on the same port as the app, so in a container it is
 * reachable through the public Route or Ingress. Set `METRICS_TOKEN` to require
 * `Authorization: Bearer <token>` on every scrape (Prometheus:
 * `authorization.credentials`). Leave it unset to keep the endpoint open, for
 * example when the scraper shares a private network with the pod.
 */
export async function metricsEndpoint(options: MetricsEndpointOptions = {}): Promise<Response> {
  const token = (options.env ?? serverEnv()).METRICS_TOKEN?.trim();
  if (token) {
    const presented = options.request?.headers.get("authorization") ?? "";
    if (!constantTimeEqual(presented, `Bearer ${token}`)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" }
      });
    }
  }

  const body = await metricsRegistry.metrics();
  return new Response(body, {
    headers: { "Content-Type": metricsRegistry.contentType, "Cache-Control": "no-store" }
  });
}
