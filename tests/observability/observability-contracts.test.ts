import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  alertParityFindings,
  exposedSeries,
  failedRequestFindings,
  hookWiringFindings,
  logSchemaFindings,
  parseLogStream,
  promqlMetricNames,
  type LogLine
} from "../../scripts/checks/observability.ts";
import { REPO_ROOT, readText } from "../../scripts/checks/lib/repo.ts";
import {
  clearGlobalContext,
  createLogger,
  createRequestLogger,
  logRequestError,
  setAppName,
  type LogEntry
} from "../../packages/svelte/utils/logger/src/index.ts";
import { metricsHandle, metricsRegistry } from "../../packages/svelte/utils/metrics/src/index.ts";

const APPS = ["reader", "catalogue", "live", "time"];
const ALERTS = readText(join(REPO_ROOT, "observability/grafana/provisioning/alerting/alerts.yml"));

function makeEvent(path: string, headers: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`);
  return { request: new Request(url, { headers }), url, route: { id: "/course/[courseid]" }, locals: {} };
}

type Handle = (input: { event: never; resolve: (event: never) => Promise<Response> }) => Promise<Response>;

/** SvelteKit's `sequence`, reduced to what the contract needs: each handle's resolve calls the next. */
function chain(...handles: Handle[]) {
  return (event: never, terminal: (event: never) => Promise<Response>) =>
    handles.reduceRight<(event: never) => Promise<Response>>((next, handle) => (e) => handle({ event: e, resolve: next }), terminal)(event);
}

/** A logger that captures entries instead of printing them. */
function capture() {
  const entries: LogEntry[] = [];
  return { entries, logger: createLogger({ level: "debug", output: (entry) => entries.push(entry) }) };
}

describe("observability contracts (runway tier K)", () => {
  describe("log schema", () => {
    it("the request logger's completion line satisfies the schema", async () => {
      const { entries, logger } = capture();
      setAppName("tutors-reader");
      try {
        const handle = createRequestLogger({ logger });
        await handle({ event: makeEvent("/course/cs101"), resolve: async () => new Response("ok") });
      } finally {
        clearGlobalContext();
      }
      expect(entries).toHaveLength(1);
      expect(logSchemaFindings(entries)).toEqual([]);
    });

    it("negative fixtures: rejects a bad level, a missing request id on a completion line and a non-JSON line", () => {
      const completed = { timestamp: "2026-09-16T10:00:00.000Z", message: "request completed", requestId: "r1", method: "GET", path: "/", route: null, status: 200, duration_ms: 3 };
      const findings = logSchemaFindings([
        { timestamp: "2026-09-16T10:00:00.000Z", level: "fatal", message: "boom" },
        { ...completed, requestId: undefined, level: "info" },
        { ...completed, level: "info", loadError: true },
        { ...completed, level: "error", loadError: "yes" }
      ]);
      expect(findings.some((f) => f.startsWith("line 1: level"))).toBe(true);
      expect(findings.some((f) => f.startsWith("line 2: requestId"))).toBe(true);
      expect(findings).toContain("line 3: level a completion line with loadError must be logged at error");
      expect(findings.some((f) => f.startsWith("line 4: loadError"))).toBe(true);
      expect(logSchemaFindings([{ ...completed, level: "error", loadError: true }])).toEqual([]);
      expect(parseLogStream('{"level":"info"}\nListening on http://0.0.0.0:3000\nServer ready\n').findings).toEqual([
        "line 2: not JSON: Server ready"
      ]);
    });
  });

  describe("request correlation", () => {
    it("a failed request produces lines that all carry the caller's request id, and exactly one error line with a stack", async () => {
      const { entries, logger } = capture();
      // SvelteKit catches a throwing route, calls handleError inside resolve(), then returns a 500.
      const handle = chain(createRequestLogger({ logger }) as unknown as Handle, metricsHandle as unknown as Handle);
      const response = await handle(makeEvent("/course/cs101", { "x-request-id": "req-contract-1" }) as never, async (event) => {
        logRequestError({ error: new Error("database unreachable"), event, status: 500, message: "Internal Error" }, logger);
        return new Response("Internal Error", { status: 500 });
      });

      expect(response.status).toBe(500);
      expect(response.headers.get("x-request-id")).toBe("req-contract-1");
      expect(failedRequestFindings(entries as LogLine[], "req-contract-1")).toEqual([]);
    });

    it("a server load that throws inside a 200 __data.json response is still logged as a failure", async () => {
      const { entries, logger } = capture();
      const handle = chain(createRequestLogger({ logger }) as unknown as Handle, metricsHandle as unknown as Handle);
      // SvelteKit calls handleError for the failing node, then answers 200 with an error node in the JSON.
      const response = await handle(makeEvent("/course/cs101/__data.json", { "x-request-id": "req-contract-2" }) as never, async (event) => {
        logRequestError({ error: new Error("MissingSecret"), event, status: 500, message: "Internal Error" }, logger);
        return Response.json({ type: "data", nodes: [{ type: "error", error: { message: "An unexpected error occurred" } }] });
      });

      expect(response.status).toBe(200);
      expect(failedRequestFindings(entries as LogLine[], "req-contract-2")).toEqual([]);
      expect(logSchemaFindings(entries)).toEqual([]);
      expect(entries.find((e) => e.message === "request completed")).toMatchObject({ level: "error", status: 200, loadError: true });
    });

    it("negative fixture: flags a completion line that records a failed data request as a plain 200", () => {
      const lines = [
        { timestamp: "2026-09-16T10:00:00.000Z", level: "error", message: "Unhandled server error", requestId: "r1", status: 500, stack: "Error: x" },
        { timestamp: "2026-09-16T10:00:00.000Z", level: "info", message: "request completed", requestId: "r1", status: 200 }
      ] as LogLine[];
      expect(failedRequestFindings(lines, "r1")).toEqual([
        '"request completed" records status 200 at info without loadError, so the failure looks like a success'
      ]);
    });

    it("negative fixtures: flags an uncorrelated line, a silent failure and a double-logged failure", () => {
      const line = (overrides: Partial<LogLine> & Record<string, unknown>): LogLine =>
        ({ timestamp: "2026-09-16T10:00:00.000Z", level: "error", message: "x", requestId: "r1", ...overrides }) as LogLine;
      expect(failedRequestFindings([line({ stack: "Error: x" }), line({ requestId: undefined, message: "orphan" })], "r1")).toEqual([
        "1 line(s) without request id r1: orphan"
      ]);
      expect(failedRequestFindings([line({ level: "info" })], "r1")).toEqual(["expected exactly 1 error line with a stack, found 0"]);
      expect(failedRequestFindings([line({ stack: "a" }), line({ stack: "b" })], "r1")).toEqual([
        "expected exactly 1 error line with a stack, found 2"
      ]);
    });

    it.each(APPS)("%s wires the request logger first, metrics, handleError and its app name", (app) => {
      expect(hookWiringFindings(app, readText(join(REPO_ROOT, "apps", app, "src/hooks.server.ts")))).toEqual([]);
    });

    it("negative fixtures: flags a logger that is not first, missing metrics, a bare handleError and a wrong app name", () => {
      const source = `
        import { sequence } from "@sveltejs/kit/hooks";
        setAppName("tutors-reader");
        const requestLogger = createRequestLogger();
        export const handle = sequence(securityHeaders, requestLogger);
        export const handleError = ({ error }) => { console.error(error); };
      `;
      expect(hookWiringFindings("live", source)).toEqual([
        "live: the request logger is not the first handle in sequence(...)",
        "live: metricsHandle is missing from sequence(...)",
        "live: handleError does not call logRequestError",
        'live: setAppName("tutors-live") is missing (found tutors-reader)'
      ]);
      const aliased = `const requestLogger = createRequestLogger(); export const handle = sequence(requestLogger, metricsHandle);
        export const handleError = (i) => { logRequestError(i); }; setAppName("tutors-live");`;
      expect(hookWiringFindings("live", aliased)).toEqual([]);
    });
  });

  describe("alert rules query series the apps export", () => {
    it("every metric in the provisioned Grafana alerts exists in /metrics after one request", async () => {
      await metricsHandle({ event: makeEvent("/course/cs101") as never, resolve: async () => new Response("ok") });
      const exposition = await metricsRegistry.metrics();
      expect(alertParityFindings(ALERTS, exposition)).toEqual([]);
    });

    it("negative fixture: renaming a metric names the alert that broke", async () => {
      await metricsHandle({ event: makeEvent("/course/cs101") as never, resolve: async () => new Response("ok") });
      const renamed = (await metricsRegistry.metrics()).replaceAll("http_requests_total", "http_requests_count");
      expect(alertParityFindings(ALERTS, renamed)).toEqual([
        "alert high-error-rate queries http_requests_total, which /metrics does not export"
      ]);
    });

    it("extracts metric names from PromQL and exposition text", () => {
      expect(
        promqlMetricNames('sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100')
      ).toEqual(["http_requests_total"]);
      expect(promqlMetricNames("histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))")).toEqual([
        "http_request_duration_seconds_bucket"
      ]);
      expect(promqlMetricNames("up == 0")).toEqual(["up"]);
      expect([...exposedSeries('# HELP x y\nx_bucket{le="1"} 3\nx_sum 2\n')]).toEqual(["x_bucket", "x_sum"]);
    });
  });
});
