import { describe, it, expect, beforeEach } from "vitest";
import {
  metricsHandle,
  metricsEndpoint,
  metricsRegistry,
  httpRequestsTotal,
  httpRequestsInFlight,
  httpRequestDuration,
} from "../../../packages/svelte/utils/metrics/src/index.ts";

function makeEvent(init: { method?: string; path?: string; headers?: Record<string, string>; routeId?: string | null } = {}) {
  const { method = "GET", path = "/course/cs101", headers = {}, routeId = "/course/[courseid]" } = init;
  const url = new URL(`http://localhost${path}`);
  return {
    request: new Request(url, { method, headers }),
    url,
    route: { id: routeId },
    locals: {},
  };
}

const respond = (status = 200) => async () => new Response("body", { status });

// The middleware is typed against SvelteKit's RequestEvent; the tests only
// need the fields it reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handle = metricsHandle as unknown as (input: { event: any; resolve: any }) => Promise<Response>;

async function counterValue(labels: Record<string, string>): Promise<number> {
  const metric = await httpRequestsTotal.get();
  const match = metric.values.find((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val));
  return match?.value ?? 0;
}

async function inFlight(): Promise<number> {
  const metric = await httpRequestsInFlight.get();
  return metric.values[0]?.value ?? 0;
}

beforeEach(() => {
  metricsRegistry.resetMetrics();
});

describe("metrics middleware", () => {
  it("counts and times a request by method, route and status", async () => {
    const response = await handle({ event: makeEvent({ method: "POST", routeId: "/api/notes" }), resolve: respond(201) });

    expect(response.status).toBe(201);
    expect(await counterValue({ method: "POST", route: "/api/notes", status_code: "201" })).toBe(1);

    const histogram = await httpRequestDuration.get();
    const count = histogram.values.find((v) => v.metricName === "http_request_duration_seconds_count");
    expect(count?.value).toBe(1);
    expect(await inFlight()).toBe(0);
  });

  it("collapses unmatched routes into one series rather than one per path", async () => {
    await handle({ event: makeEvent({ path: "/wp-admin.php", routeId: null }), resolve: respond(404) });
    await handle({ event: makeEvent({ path: "/.env", routeId: null }), resolve: respond(404) });

    expect(await counterValue({ route: "unmatched", status_code: "404" })).toBe(2);
    const metric = await httpRequestsTotal.get();
    expect(metric.values.some((v) => String(v.labels.route).includes("wp-admin"))).toBe(false);
  });

  it("does not instrument the scrape or probe endpoints", async () => {
    for (const path of ["/metrics", "/healthz", "/healthz/live"]) {
      await handle({ event: makeEvent({ path, routeId: path }), resolve: respond(200) });
    }
    const metric = await httpRequestsTotal.get();
    expect(metric.values).toHaveLength(0);
  });

  it("records a 500 and releases the in-flight gauge when resolve throws", async () => {
    const boom = new Error("db down");
    await expect(handle({ event: makeEvent(), resolve: async () => { throw boom; } })).rejects.toBe(boom);

    expect(await counterValue({ route: "/course/[courseid]", status_code: "500" })).toBe(1);
    expect(await inFlight()).toBe(0);
  });
});

describe("metrics endpoint", () => {
  it("serves the registry in Prometheus text format and forbids caching", async () => {
    await handle({ event: makeEvent(), resolve: respond(200) });
    const response = await metricsEndpoint({ env: {} });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("http_requests_total{");
    expect(body).toContain("process_cpu_seconds_total");
  });

  it("is open when METRICS_TOKEN is unset", async () => {
    const response = await metricsEndpoint({ request: new Request("http://localhost/metrics"), env: {} });
    expect(response.status).toBe(200);
  });

  it("requires a matching bearer token when METRICS_TOKEN is set", async () => {
    const env = { METRICS_TOKEN: "s3cret" };

    const missing = await metricsEndpoint({ request: new Request("http://localhost/metrics"), env });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toBe("Bearer");

    const wrong = await metricsEndpoint({
      request: new Request("http://localhost/metrics", { headers: { authorization: "Bearer nope" } }),
      env,
    });
    expect(wrong.status).toBe(401);

    const right = await metricsEndpoint({
      request: new Request("http://localhost/metrics", { headers: { authorization: "Bearer s3cret" } }),
      env,
    });
    expect(right.status).toBe(200);
  });
});
