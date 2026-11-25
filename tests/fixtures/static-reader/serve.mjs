// A plain file server, standing in for the one Tutors Studio runs (Rule 0773): GET and HEAD of files under a
// folder on 127.0.0.1. `--fallback 200.html` answers unknown paths with that page (the static reader);
// `--cors` adds the header a course server needs. It knows nothing about the reader's server routes, so a
// request for one gets 404, and the test sees it.
//
//   node tests/fixtures/static-reader/serve.mjs <folder> <port> [--fallback 200.html] [--cors]
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const [, , folder, port, ...flags] = process.argv;
const root = resolve(folder);
const fallback = flags.includes("--fallback") ? flags[flags.indexOf("--fallback") + 1] : null;
const cors = flags.includes("--cors");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff": "font/woff", ".woff2": "font/woff2", ".pdf": "application/pdf", ".wasm": "application/wasm", ".ico": "image/x-icon" };

createServer((request, response) => {
  const headers = cors ? { "access-control-allow-origin": "*", "cache-control": "no-store" } : {};
  if (request.method !== "GET" && request.method !== "HEAD") return response.writeHead(405, headers).end();
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  if (path === "/ready") return response.writeHead(200, headers).end("ready");
  let file = resolve(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) return response.writeHead(403, headers).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    if (!fallback || path.startsWith("/_app/")) return response.writeHead(404, headers).end();
    file = join(root, fallback);
  }
  response.writeHead(200, { ...headers, "content-type": types[extname(file)] ?? "application/octet-stream" });
  response.end(request.method === "HEAD" ? undefined : readFileSync(file));
}).listen(Number(port), "127.0.0.1", () => process.stdout.write(`serving ${root} on http://127.0.0.1:${port}\n`));
