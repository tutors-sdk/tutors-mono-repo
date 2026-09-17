// Static server for the generated fixture course (runway tier G).
//
//   node tests/e2e-stack/fixture-course/serve.mjs [root] [port]
//
// The reader fetches `http://<courseid>/tutors.json` from the browser, so every
// response allows any origin, as Netlify does for published courses.
// FIXTURE_FAULT=500 answers 500 for tutors.json: the negative fixture the
// journeys must fail against.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? process.env.COURSE_ROOT ?? "tests/e2e-stack/work/course");
const port = Number(process.argv[3] ?? process.env.PORT ?? 8080);
const fault = process.env.FIXTURE_FAULT ?? "";

const TYPES = {
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".marp": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip"
};

createServer((req, res) => {
  const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" };
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);

  if (pathname === "/healthz") return res.writeHead(200, headers).end("ok");
  if (fault === "500" && pathname === "/tutors.json") return res.writeHead(500, headers).end("fixture fault");

  const file = normalize(join(root, pathname));
  if (!file.startsWith(root)) return res.writeHead(403, headers).end();
  try {
    const target = statSync(file).isDirectory() ? join(file, "index.html") : file;
    statSync(target);
    res.writeHead(200, { ...headers, "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, headers).end("not found");
  }
}).listen(port, () => console.log(JSON.stringify({ level: "info", message: "fixture course server listening", port, root, fault })));
