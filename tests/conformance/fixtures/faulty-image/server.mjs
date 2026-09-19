// A minimal stand-in for a Tutors app: JSON logs, /healthz/live, /metrics.
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";

const log = (level, message, fields = {}) =>
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, app: "tutors-fixture", ...fields }));

const fault = process.env.FIXTURE_FAULT ?? "";
if (fault === "readonly") writeFileSync("/app/cache.json", "{}");
if (fault === "uid") readFileSync("/app/private.json", "utf8");

let requests = 0;
createServer((req, res) => {
  const requestId = req.headers["x-request-id"] ?? "generated";
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
  log("info", "request completed", { requestId, method: req.method, path: url.pathname, route: "/", status: 200, duration_ms: 1 });
}).listen(3000, () => log("info", "Service starting"));
