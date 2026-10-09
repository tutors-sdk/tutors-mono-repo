// Exercise the built reader behind a proxy that owns its origin headers.
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const listener = createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const reader = spawn(process.execPath, ["build/index.js"], {
  cwd: fileURLToPath(new URL("../../../apps/reader/", import.meta.url)),
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), PROTOCOL_HEADER: "x-forwarded-proto", HOST_HEADER: "x-forwarded-host" },
  stdio: "inherit"
});
const proxy = createServer((incoming, outgoing) => {
  const upstream = request({ host: "127.0.0.1", port, path: incoming.url, method: incoming.method,
    headers: { ...incoming.headers, "x-forwarded-proto": "http", "x-forwarded-host": incoming.headers.host }
  }, (response) => {
    outgoing.writeHead(response.statusCode, response.headers);
    response.pipe(outgoing);
  });
  upstream.on("error", () => { outgoing.writeHead(502); outgoing.end(); });
  incoming.pipe(upstream);
});
proxy.listen(5173, "127.0.0.1");
function stop() { proxy.close(); reader.kill("SIGTERM"); }
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
reader.on("exit", (code) => { proxy.close(); process.exitCode = code ?? 1; });
