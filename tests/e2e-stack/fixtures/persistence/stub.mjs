// Persistence stub: a Supabase-REST-shaped server that answers every query
// with nothing and records every write, so the harness can see exactly what
// each side tried to persist during a journey.
//
//   node fixtures/persistence/stub.mjs [port]
//
//   GET    /rest/v1/<table>        -> []            (reads see an empty table; a kept table, below, its rows)
//   POST   /rest/v1/<table>        -> 201 [body]    recorded as a write
//   PATCH  /rest/v1/<table>        -> 200 []        recorded as a write
//   DELETE /rest/v1/<table>        -> 204           recorded as a write
//   POST   /rest/v1/rpc/<fn>       -> 200 []        recorded as an rpc call
//   *      /auth/v1/*              -> 200 {}        (no sessions here; identity is fixtures/identity)
//   POST   /realtime/v1/api/broadcast -> 202        accepted, not recorded (presence runs on timers)
//   POST   /realtime/v1/api/broadcast/<topic>/events/<event> -> 202  the same, as supabase-js's httpSend() posts it
//   WS     /realtime/v1/websocket  -> a Phoenix socket that replies ok to every push (joins, heartbeats,
//                                     presence) and never broadcasts unless relaying (below); not recorded
//   GET    /_harness/writes        -> the log, oldest first
//   POST   /_harness/reset         -> clears the log, what is kept and seeded, and relaying
//   POST   /_harness/relay         -> since 1.46.0: until the next reset, every broadcast (over REST or the socket)
//                                     reaches the other sockets joined to its topic, as Supabase Realtime sends it
//   POST   /_harness/seed          -> {"<table>": [rows]}: since 1.47.0, rows a journey's reads see (below); not a write
//   POST   /_harness/fault         -> {"mode": "down" | "hang" | "off"}: until the next reset, every /rest/v1 and /auth/v1
//                                     call answers 503 (down) or is never answered (hang). Added in the monorepo's copy
//                                     (tests/e2e-stack) for its resilience journeys, Rules 0615 and 0616.
//   POST   /moodle/webservice/rest/server.php -> a Moodle web service with one course (1234) holding assignment 11
//                                     "Lab report" and one submission from Moodle user 42. Added in the monorepo's copy
//                                     for the Moodle sync journey, Rule 0640; not recorded (the writes it causes are).
//
// Since 1.45.0 the stub keeps the rows written to the tables in KEPT until the next reset, and answers reads of
// them with those rows (filtered by `col=eq.value`, upserted by `on_conflict`): a lecturer's content lock is read
// back by the student's browser in the same journey (the lock journey, Rule 0588). Since 1.46.0 also the latest
// learning object each student opened, which Tutors Live reads (`gte`, `order` and `limit` too: the Live journey, Rule
// 0589). Every other table still reads empty. What is kept never reaches the ledger: the writes are recorded as before.
//
// Since 1.47.0 a journey can seed tables over `/_harness/seed` before it reads them (the time app's calendar and
// learning records: Rules 0590 and 0591, fixtures/persistence/seeds). A seeded table is kept like the tables above until
// the next reset, so its reads answer the seeded rows (and `in.(a,b)` too).
//
// Both sides get their own stub, so a write is attributable. The stub sends no
// Date header and no ids: nothing here may differ between the sides.
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? process.env.PORT ?? 8090);
const BROADCAST = /^\/realtime\/v1\/api\/broadcast(\/[^/]+\/events\/[^/]+)?$/;
let writes = [];
let seq = 0;
/**
 * The tables whose rows are kept and read back: the reader's content locks (packages/svelte/utils/rbac/src/lock-store.ts)
 * and, since 1.46.0, each student's latest learning object, Tutors Live's stored activity
 * (packages/svelte/community/src/utils/supabase-client.ts).
 */
const KEPT = new Set(["tutors_content_locks", "tutors-connect-latest"]);
let kept = new Map();
/** Since 1.46.0: whether broadcasts reach the sockets joined to their topic (a journey asks; reset turns it off). */
let relay = false;
/** Each open Realtime socket and the topics (`realtime:<name>`) it has joined. */
const sockets = new Map();
/** Tables seeded by the journey running now: read back like KEPT until the next reset. */
let seeded = new Set();
const isKept = (table) => KEPT.has(table) || seeded.has(table);
/** The data API's fault, set by a resilience journey: "down", "hang" or "off". */
let fault = "off";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-expose-headers": "*",
  "cache-control": "no-store"
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

const server = createServer(async (req, res) => {
  res.sendDate = false;
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status, body, extra = {}) => {
    const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(status, { ...cors, ...extra, ...(text ? { "content-type": "application/json" } : {}) });
    res.end(text);
  };

  if (req.method === "OPTIONS") return send(204);
  if (url.pathname === "/healthz") return send(200, { status: "ok" });
  if (url.pathname === "/_harness/writes") return send(200, writes);
  if (url.pathname === "/_harness/reset" && req.method === "POST") {
    writes = [];
    kept = new Map();
    relay = false;
    seeded = new Set();
    fault = "off";
    return send(204);
  }
  if (url.pathname === "/_harness/relay" && req.method === "POST") {
    relay = true;
    return send(204);
  }
  if (url.pathname === "/_harness/seed" && req.method === "POST") {
    const seed = safeJson(await readBody(req))[0] ?? {};
    for (const [table, rows] of Object.entries(seed)) {
      if (!Array.isArray(rows)) return send(400, { message: `seed for ${table} is not a list of rows` });
      seeded.add(table);
      kept.set(table, [...(kept.get(table) ?? []), ...rows]);
    }
    return send(204);
  }

  if (url.pathname === "/_harness/fault" && req.method === "POST") {
    const mode = safeJson(await readBody(req))[0]?.mode;
    if (!["down", "hang", "off"].includes(mode)) return send(400, { message: 'mode must be "down", "hang" or "off"' });
    fault = mode;
    return send(204);
  }
  if (fault !== "off" && /^\/(rest|auth)\/v1\//.test(url.pathname)) {
    if (fault === "hang") return;
    return send(503, { message: "the data API is down (fault injected)" });
  }

  if (url.pathname === "/moodle/webservice/rest/server.php" && req.method === "POST") {
    const form = new URLSearchParams(await readBody(req));
    switch (form.get("wsfunction")) {
      case "core_course_get_contents":
        if (form.get("courseid") !== "1234") return send(200, { exception: "dml_missing_record_exception", errorcode: "invalidrecord", message: "No such course" });
        return send(200, [{ id: 1, modules: [{ id: 7, instance: 11, name: "Lab report", modname: "assign" }] }]);
      case "mod_assign_get_submissions":
        return send(200, { assignments: [{ assignmentid: 11, submissions: [{ id: 901, userid: 42, status: "submitted" }] }], warnings: [] });
      default:
        return send(200, { exception: "webservice_access_exception", errorcode: "accessexception", message: "Access control exception" });
    }
  }

  const rest = /^\/rest\/v1\/(rpc\/)?([^/?]+)/.exec(url.pathname);
  if (rest) {
    const [, rpc, name] = rest;
    const body = await readBody(req);
    if (rpc) {
      writes.push({ seq: ++seq, kind: "rpc", method: req.method, table: name });
      return send(200, []);
    }
    if (isKept(name)) keep(req.method, name, url.searchParams, body);
    switch (req.method) {
      case "GET":
      case "HEAD": {
        const rows = isKept(name) ? matching(name, url.searchParams) : [];
        return send(200, rows, { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" });
      }
      case "POST": {
        writes.push({ seq: ++seq, kind: "write", method: "POST", table: name, rows: rowCount(body) });
        return send(201, body ? safeJson(body) : []);
      }
      case "PATCH":
      case "PUT":
        writes.push({ seq: ++seq, kind: "write", method: req.method, table: name, rows: rowCount(body) });
        return send(200, []);
      case "DELETE":
        writes.push({ seq: ++seq, kind: "write", method: "DELETE", table: name, rows: 0 });
        return send(204);
      default:
        return send(405);
    }
  }
  if (url.pathname.startsWith("/auth/v1/")) {
    await readBody(req);
    return send(200, {});
  }
  // Realtime's websocket is refused (no upgrade handler), so the client falls back to posting
  // presence broadcasts over REST on a timer. Answering 404 made the browser log a "Failed to load
  // resource ... 404" whose count per page depended on the timer, an A/A console diff. Accept them
  // as Supabase does; they are presence, not writes, so the persistence artefact does not record them.
  // Since 1.37.2 also the per-topic path supabase-js 2.7x's channel.httpSend() posts to: answering it 404 put
  // "httpSend() requires Realtime server v2.97.0 or newer" in the reader's console on both sides, 8 errors a run.
  const broadcast = BROADCAST.exec(url.pathname);
  if (broadcast && req.method === "POST") {
    const body = await readBody(req);
    if (relay) {
      try {
        const topicEvent = /^\/([^/]+)\/events\/([^/]+)$/.exec(broadcast[1] ?? "");
        if (topicEvent) fanOut(decodeURIComponent(topicEvent[1]), decodeURIComponent(topicEvent[2]), JSON.parse(body || "null"));
        else for (const m of JSON.parse(body || "{}").messages ?? []) fanOut(m.topic, m.event, m.payload);
      } catch {
        /* not JSON: nothing to relay */
      }
    }
    return send(202);
  }
  if (url.pathname.startsWith("/storage/v1/")) return send(404, { message: "no storage in the harness" });
  return send(404, { message: "not found" });
});

/** One filter operator, by name; a switch rather than a lookup so a request's text cannot pick the function. */
function compare(op, x, y) {
  switch (op) {
    case "eq":
      return x === y;
    case "gt":
      return x > y;
    case "gte":
      return x >= y;
    case "lt":
      return x < y;
    case "lte":
      return x <= y;
    case "in":
      return y.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, "")).includes(x);
    default:
      return false;
  }
}
/** PostgREST's `col=<op>.value` filters (eq, gt, gte, lt, lte, in; compared as strings, as ISO times are); every other parameter (select, order, limit, on_conflict) is not a filter. */
function filtersOf(params) {
  const out = [];
  for (const [key, value] of params) {
    const m = /^(eq|gte?|lte?|in)\.(.*)$/s.exec(value);
    if (m && !["select", "order", "limit", "offset", "on_conflict"].includes(key)) out.push([key, m[1], m[2]]);
  }
  return out;
}
function matches(row, filters) {
  return filters.every(([key, op, value]) => compare(op, String(row[key]), value));
}
/** The kept rows a read asks for: filtered, then `order=col.asc|desc` (first column only), then `limit`. */
function matching(table, params) {
  const filters = filtersOf(params);
  const rows = (kept.get(table) ?? []).filter((row) => matches(row, filters));
  const [column, direction] = (params.get("order") ?? "").split(",")[0].split(".");
  if (column) rows.sort((x, y) => String(x[column]).localeCompare(String(y[column])) * (direction === "desc" ? -1 : 1));
  const limit = Number(params.get("limit"));
  return limit > 0 ? rows.slice(0, limit) : rows;
}
/** Apply a write to a kept table: insert or upsert (by `on_conflict`), update, or delete the matching rows. */
function keep(method, table, params, body) {
  const rows = kept.get(table) ?? [];
  kept.set(table, rows);
  if (method === "POST") {
    const conflict = (params.get("on_conflict") ?? "").split(",").filter(Boolean);
    for (const row of safeJson(body)) {
      const at = conflict.length ? rows.findIndex((r) => conflict.every((c) => String(r[c]) === String(row[c]))) : -1;
      if (at >= 0) rows[at] = { ...rows[at], ...row };
      else rows.push(row);
    }
  } else if (method === "PATCH" || method === "PUT") {
    const [patch] = safeJson(body);
    const filters = filtersOf(params);
    for (let i = 0; i < rows.length; i++) if (matches(rows[i], filters)) rows[i] = { ...rows[i], ...patch };
  } else if (method === "DELETE") {
    const filters = filtersOf(params);
    kept.set(table, rows.filter((r) => !matches(r, filters)));
  }
}

function safeJson(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}
function rowCount(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.length : 1;
  } catch {
    return 1;
  }
}

// Realtime. The reader's Supabase client opens a websocket here for presence. Refusing it made the client
// log "WebSocket connection ... failed" and retry on a backoff timer, so whether a page's console held
// that message depended on whether a retry fell inside the page's window: an A/A console diff. So the
// stub accepts the socket and answers the Phoenix protocol (vsn 2.0.0: each text frame is
// [join_ref, ref, topic, event, payload]) with an ok reply to every push that carries a ref. It never
// sends anything unasked, so both sides see the same empty presence. Binary frames (user broadcasts,
// no ack requested) are read and dropped.
server.on("upgrade", (req, socket) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const key = req.headers["sec-websocket-key"];
  if (url.pathname !== "/realtime/v1/websocket" || typeof key !== "string") {
    socket.end("HTTP/1.1 404 Not Found\r\nconnection: close\r\n\r\n");
    return;
  }
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\nsec-websocket-accept: ${accept}\r\n\r\n`);
  const topics = new Set();
  sockets.set(socket, topics);
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => socket.destroy());
  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const frame = readFrame(buffer);
      if (!frame) return;
      buffer = buffer.subarray(frame.length);
      if (frame.opcode === 0x8) {
        socket.end(frameOf(0x8, Buffer.alloc(0)));
        return;
      }
      if (frame.opcode === 0x9) socket.write(frameOf(0xa, frame.payload));
      if (frame.opcode === 0x1) {
        const text = frame.payload.toString("utf8");
        track(text, topics, socket);
        const reply = phoenixReply(text);
        if (reply) socket.write(frameOf(0x1, Buffer.from(reply)));
      }
      if (frame.opcode === 0x2 && relay) {
        const push = userBroadcastPush(frame.payload);
        if (push) fanOut(push.topic.replace(/^realtime:/, ""), push.event, push.payload, socket);
      }
    }
  });
});

/** Joins and leaves, so a relayed broadcast reaches the sockets on its topic; a JSON broadcast push is relayed too. */
function track(text, topics, from) {
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  if (!Array.isArray(message)) return;
  const [, , topic, event, payload] = message;
  if (typeof topic !== "string") return;
  if (event === "phx_join") topics.add(topic);
  if (event === "phx_leave") topics.delete(topic);
  if (event === "broadcast" && relay && payload && typeof payload.event === "string") fanOut(topic.replace(/^realtime:/, ""), payload.event, payload.payload, from);
}

/** realtime-js's binary user broadcast push (kind 3): sizes of join ref, ref, topic, event and metadata, then the encoding (1 is JSON). */
function userBroadcastPush(bytes) {
  if (bytes.length < 7 || bytes[0] !== 3) return undefined;
  const [joinRef, ref, topic, event, meta, encoding] = bytes.subarray(1, 7);
  let at = 7 + joinRef + ref;
  const text = (n) => bytes.subarray(at, (at += n)).toString("utf8");
  const topicName = text(topic);
  const eventName = text(event);
  at += meta;
  if (encoding !== 1) return undefined;
  try {
    return { topic: topicName, event: eventName, payload: JSON.parse(bytes.subarray(at).toString("utf8")) };
  } catch {
    return undefined;
  }
}

/** Sends a broadcast to every other socket joined to `realtime:<topic>`, as a Phoenix "broadcast" message. */
function fanOut(topic, event, payload, from) {
  if (typeof topic !== "string" || typeof event !== "string") return;
  const frame = frameOf(0x1, Buffer.from(JSON.stringify([null, null, `realtime:${topic}`, "broadcast", { type: "broadcast", event, payload }])));
  for (const [socket, topics] of sockets) if (socket !== from && topics.has(`realtime:${topic}`)) socket.write(frame);
}

function phoenixReply(text) {
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!Array.isArray(message)) return undefined;
  const [joinRef, ref, topic, event] = message;
  if (ref === null || ref === undefined) return undefined;
  const response = event === "phx_join" ? { postgres_changes: [] } : {};
  return JSON.stringify([joinRef ?? null, ref, topic, "phx_reply", { status: "ok", response }]);
}

/** One client frame from the start of the buffer (clients always mask), or undefined until it is all there. */
function readFrame(buffer) {
  if (buffer.length < 2) return undefined;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return undefined;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return undefined;
    length = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  const maskAt = offset;
  if (masked) offset += 4;
  if (buffer.length < offset + length) return undefined;
  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= buffer[maskAt + (i % 4)];
  return { opcode, payload, length: offset + length };
}

/** One unmasked, unfragmented server frame. */
function frameOf(opcode, payload) {
  const head = payload.length < 126 ? Buffer.from([0x80 | opcode, payload.length]) : payload.length < 65536 ? Buffer.from([0x80 | opcode, 126, 0, 0]) : Buffer.from([0x80 | opcode, 127, 0, 0, 0, 0, 0, 0, 0, 0]);
  if (payload.length >= 126 && payload.length < 65536) head.writeUInt16BE(payload.length, 2);
  if (payload.length >= 65536) head.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([head, payload]);
}

// A container log line, as the stack's other services write.
// eslint-disable-next-line no-console
server.listen(port, () => console.log(JSON.stringify({ level: "info", message: "persistence stub listening", port })));
