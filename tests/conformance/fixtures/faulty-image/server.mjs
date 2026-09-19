// A minimal stand-in for a Tutors app: JSON logs, /healthz/live, /metrics.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// Same core keys, in the same order, as @tutors/logger writes (deploy/README.md, "Log contract").
const log = (level, event, message, { requestId = null, ...fields } = {}) =>
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      app: "tutors-fixture",
      environment: "production",
      hostname: process.env.HOSTNAME ?? null,
      pid: process.pid,
      requestId,
      ...fields
    })
  );

const fault = process.env.FIXTURE_FAULT ?? "";
if (fault === "readonly") writeFileSync("/app/cache.json", "{}");
if (fault === "uid") readFileSync("/app/private.json", "utf8");

let requests = 0;
createServer((req, res) => {
  const requestId = req.headers["x-request-id"] ?? randomUUID();
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/healthz/live") return res.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
  if (url.pathname === "/version") {
    return res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ app: "tutors-fixture", version: "0.0.0", revision: "unknown", built: "unknown", clock: "system" }));
  }
  if (url.pathname === "/metrics") {
    return res
      .writeHead(200, { "content-type": "text/plain" })
      .end(
        `http_requests_total{method="GET",route="/",status_code="200"} ${requests}\n` +
          `http_request_duration_seconds_bucket{le="+Inf"} ${requests}\n`
      );
  }
  requests++;
  // FIXTURE_FAULT=nondeterministic: a header that changes on every response, outside x-request-id.
  const noise = fault === "nondeterministic" ? { "x-served-by": `worker-${requests}` } : {};
  res.writeHead(200, { "x-request-id": requestId, ...noise }).end("ok");
  log("info", "request.completed", "request completed", {
    requestId,
    method: req.method,
    path: url.pathname,
    route: "/",
    status: 200,
    duration_ms: 1,
    slow: false,
    loadError: false
  });
}).listen(3000, () => log("info", "service.start", "Service starting", { logLevel: "info", node: process.version, version: "0.0.0" }));
