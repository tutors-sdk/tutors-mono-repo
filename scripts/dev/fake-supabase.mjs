/**
 * DEV-ONLY fake Supabase for exercising snippet sharing locally (issue #155).
 *
 * Stands in for a real project so the feature can be driven end to end without
 * provisioning anything. It speaks the two protocols the apps actually use:
 *
 *   - PostgREST  `/rest/v1/<table>`      — the subset of filters/verbs used by
 *                                          the reader write route, the educator
 *                                          dashboard, and TutorsTime.
 *   - Realtime   `/realtime/v1/websocket` — Phoenix channels, enough to fan a
 *                                          broadcast out to other subscribers.
 *                                          This is what carries the toast from
 *                                          the reader to the time app.
 *
 * It deliberately does NOT serve a course. The educator gate and the PIN dialog
 * both read a published `tutors.json`, and faking that would mean inventing the
 * very `enrollment.educators` and `properties.ignorepin` the feature is meant
 * to be tested against — proving only that the code agrees with the fake.
 * Publish a real course instead:
 *
 *   cd ../tutors-reference-course
 *   deno run -A ../tutors-mono-repo/packages/jsr/tutors/main.ts
 *   deno run -A jsr:@std/http/file-server --port 8080 --cors json
 *
 * then start this against it:
 *
 *   FAKE_COURSE_ID=localhost:8080 node scripts/dev/fake-supabase.mjs
 *
 * `GET /dev/ping` fires the content-free `gist-created` broadcast, so the
 * educator toast can be driven without a student browser.
 *
 * What this cannot show you is RLS. There are no policies here; this is the
 * service-role view of the world. "Closed to anon" is a property of the
 * migration, not of application code.
 *
 * Run: node scripts/dev/fake-supabase.mjs
 */

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const { WebSocketServer } = require("../../node_modules/.pnpm/ws@8.21.3/node_modules/ws");

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54321);
const COURSE_ID = process.env.FAKE_COURSE_ID ?? `localhost:8080`;

const HOUR = 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

// ── The real course ──────────────────────────────────────────────────────────
//
// Everything below is seeded from the published `tutors.json` rather than
// invented: the students who "shared" snippets are the course's actual
// enrolled students, and the snippets hang off its actual learning objects.
// If the course is not being served, stop — a fabricated course would only
// test this script against itself.

const courseUrl = /^(localhost|127\.0\.0\.1|192\.)/.test(COURSE_ID)
  ? `http://${COURSE_ID}/tutors.json`
  : `https://${COURSE_ID}/tutors.json`;

let course;
try {
  const res = await fetch(courseUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  course = await res.json();
} catch (err) {
  console.error(`\nCannot read the course at ${courseUrl} — ${err.message}\n`);
  console.error(`Publish and serve a real course first, e.g.\n`);
  console.error(`  cd ../tutors-reference-course`);
  console.error(`  deno run -A ../tutors-mono-repo/packages/jsr/tutors/main.ts`);
  console.error(`  deno run -A jsr:@std/http/file-server --port 8080 --cors json\n`);
  console.error(`then re-run with FAKE_COURSE_ID=localhost:8080.\n`);
  process.exit(1);
}

const EDUCATORS = course.enrollment?.educators ?? [];
const STUDENTS = course.enrollment?.students ?? [];
if (!EDUCATORS.length) {
  console.error(`\n${courseUrl} has no enrollment.educators — the gate will deny everyone.`);
  console.error(`Add an educators: list to the course's enrollment.yaml and republish.\n`);
  process.exit(1);
}

/** Depth-first walk for learning objects a student could plausibly be stuck on. */
function findLos(lo, out = []) {
  for (const child of lo?.los ?? []) {
    if (child.type === "lab" || child.type === "note" || child.type === "talk") out.push(child);
    findLos(child, out);
  }
  return out;
}
const targets = findLos(course);

/** Students the course actually enrolls, padded from the whitelist if thin. */
const roster = STUDENTS.length
  ? STUDENTS
  : (course.enrollment?.whitelist ?? []).map((id) => ({ id, name: id }));

// ── Seed data ────────────────────────────────────────────────────────────────

const snippet = (i, { title, filename, content, ageMs, ttlMs }) => {
  const who = roster[i % Math.max(roster.length, 1)] ?? { id: `student${i + 1}`, name: `Student ${i + 1}` };
  const lo = targets[i % Math.max(targets.length, 1)];
  return {
    id: randomUUID(),
    created_at: iso(Date.now() - ageMs),
    expires_at: iso(Date.now() + ttlMs),
    course_id: COURSE_ID,
    student_id: who.id,
    student_name: who.name,
    filename,
    content,
    title,
    // `{{COURSEURL}}` is a placeholder the reader substitutes at load time; the
    // published JSON carries it verbatim, so do here what the reader would do.
    lo_route: lo?.route ? lo.route.replaceAll("{{COURSEURL}}", COURSE_ID) : null,
    lo_title: lo?.title ?? null
  };
};

const db = {
  course_gists: [
    snippet(0, {
      title: "Crash as soon as I add the second item",
      filename: "stack-trace.txt",
      content:
        "TypeError: Cannot read properties of undefined (reading 'map')\n" +
        "    at renderList (app.js:42:18)\n" +
        "    at Component.render (app.js:77:5)",
      ageMs: 20 * 60 * 1000,
      ttlMs: 47 * HOUR
    }),
    snippet(1, {
      title: null,
      filename: "query.sql",
      content: "select * from students\nwhere cohort = '2025'\norder by surname;",
      ageMs: 3 * HOUR,
      ttlMs: 45 * HOUR
    }),
    // Already expired — must NOT appear (read path filters expires_at > now).
    { ...snippet(2, {
        title: "Expired snippet",
        filename: "old.txt",
        content: "THIS MUST NOT BE VISIBLE — it expired two hours ago.",
        ageMs: 50 * HOUR,
        ttlMs: 0
      }), expires_at: iso(Date.now() - 2 * HOUR) },
    // Belongs to a different course — must NOT appear.
    { ...snippet(3, {
        title: "Wrong course",
        filename: "other.txt",
        content: "THIS MUST NOT BE VISIBLE — it belongs to another course.",
        ageMs: HOUR,
        ttlMs: 47 * HOUR
      }), course_id: "some-other-course" }
  ],

  "tutors-connect-users": [
    ...roster.map((s, i) => ({
      github_id: s.id,
      avatar_url: `https://avatars.githubusercontent.com/u/${i + 1}?v=4`,
      full_name: s.name
    })),
    ...EDUCATORS.map((login) => ({
      github_id: login,
      // Real logins, so these resolve to the actual avatars.
      avatar_url: `https://github.com/${login}.png`,
      full_name: login
    }))
  ],

  "tutors-connect-courses": [
    {
      course_id: COURSE_ID,
      course_record: { title: course.title?.trim() ?? COURSE_ID, img: course.img ?? null, icon: course.icon ?? null },
      visited_at: iso(Date.now()),
      sentiment: null
    }
  ],

  learning_records: [],
  calendar: []
};

// ── PostgREST subset ─────────────────────────────────────────────────────────

/** Parse a PostgREST `col=op.value` filter value. */
function matches(row, col, raw) {
  const dot = raw.indexOf(".");
  const op = dot === -1 ? "eq" : raw.slice(0, dot);
  const val = dot === -1 ? raw : raw.slice(dot + 1);
  const cell = row[col];

  switch (op) {
    case "eq":
      return String(cell) === val;
    case "neq":
      return String(cell) !== val;
    case "gt":
      return cell > val;
    case "gte":
      return cell >= val;
    case "lt":
      return cell < val;
    case "lte":
      return cell <= val;
    case "is":
      return val === "null" ? cell == null : String(cell) === val;
    case "in": {
      const list = val
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""));
      return list.includes(String(cell));
    }
    case "like":
    case "ilike": {
      const re = new RegExp("^" + val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", op === "ilike" ? "i" : "");
      return re.test(String(cell ?? ""));
    }
    default:
      return true;
  }
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict"]);

function query(table, params) {
  let rows = [...(db[table] ?? [])];

  for (const [key, value] of params.entries()) {
    if (RESERVED.has(key)) continue;
    rows = rows.filter((r) => matches(r, key, value));
  }

  const order = params.get("order");
  if (order) {
    for (const clause of order.split(",").reverse()) {
      const [col, dir = "asc"] = clause.split(".");
      rows.sort((a, b) => {
        const x = a[col], y = b[col];
        if (x === y) return 0;
        return (x > y ? 1 : -1) * (dir.startsWith("desc") ? -1 : 1);
      });
    }
  }

  const limit = params.get("limit");
  if (limit) rows = rows.slice(0, Number(limit));
  return rows;
}

function project(rows, select) {
  if (!select || select === "*") return rows;
  const cols = select.split(",").map((c) => c.trim()).filter((c) => c && c !== "*");
  if (!cols.length) return rows;
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
}

function readBody(req) {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : null);
      } catch {
        resolve(null);
      }
    });
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Range, Content-Profile"
};

function send(res, status, body, extra = {}) {
  const payload = body == null ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...CORS, ...extra });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  // Fire the content-free `gist-created` ping exactly as ShareSnippet.svelte
  // does, for driving the educator toast without a browser on the student side.
  if (url.pathname === "/dev/ping") {
    const courseId = url.searchParams.get("courseId") ?? COURSE_ID;
    const n = fanout(`realtime:${courseId}`, {
      type: "broadcast",
      event: "gist-created",
      payload: { type: "gist-created", id: randomUUID(), courseId, sentAt: Date.now() }
    });
    log(`dev: pinged ${courseId} → ${n} subscriber(s)`);
    return send(res, 200, { pinged: courseId, subscribers: n });
  }

  if (!url.pathname.startsWith("/rest/v1/")) {
    return send(res, 404, { message: "not found" });
  }

  const table = url.pathname.slice("/rest/v1/".length);
  if (!(table in db)) db[table] = [];

  const prefer = String(req.headers["prefer"] ?? "");
  const wantsSingle = String(req.headers["accept"] ?? "").includes("pgrst.object");

  if (req.method === "GET" || req.method === "HEAD") {
    const rows = query(table, url.searchParams);
    const headers = {};
    if (prefer.includes("count=")) {
      headers["Content-Range"] = rows.length ? `0-${rows.length - 1}/${rows.length}` : `*/0`;
    }
    log(`${req.method} ${table} → ${rows.length} row(s)  ${url.search}`);
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json", ...CORS, ...headers });
      return res.end();
    }
    const out = project(rows, url.searchParams.get("select"));
    if (wantsSingle) {
      if (out.length === 1) return send(res, 200, out[0], headers);
      return send(res, 406, {
        code: "PGRST116",
        message: `JSON object requested, multiple (or no) rows returned`,
        details: `Results contain ${out.length} rows`
      });
    }
    return send(res, 200, out, headers);
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const incoming = Array.isArray(body) ? body : [body];
    const created = incoming.map((r) => ({
      id: r.id ?? randomUUID(),
      created_at: r.created_at ?? iso(Date.now()),
      ...r
    }));
    db[table].push(...created);
    log(`POST ${table} → inserted ${created.length}; table now ${db[table].length}`);
    for (const c of created) {
      if (table === "course_gists") {
        log(`   snippet from ${c.student_id}: "${(c.title ?? c.filename ?? "").slice(0, 50)}" (${(c.content ?? "").length} bytes)`);
      }
    }
    if (!prefer.includes("return=representation")) return send(res, 201, null);
    const out = project(created, url.searchParams.get("select"));
    return send(res, 201, wantsSingle ? out[0] : out);
  }

  if (req.method === "DELETE") {
    const doomed = query(table, url.searchParams);
    const ids = new Set(doomed);
    db[table] = db[table].filter((r) => !ids.has(r));
    log(`DELETE ${table} → removed ${doomed.length}; table now ${db[table].length}`);
    return send(res, prefer.includes("return=representation") ? 200 : 204, prefer.includes("return=representation") ? doomed : null);
  }

  return send(res, 405, { message: "method not allowed" });
});

// ── Realtime (Phoenix channels) ──────────────────────────────────────────────
//
// Wire format per @supabase/realtime-js `Serializer`:
//
//   - JSON frames are positional arrays: [join_ref, ref, topic, event, payload]
//     (NOT objects — the decoder destructures them).
//   - A client-side `broadcast` whose payload has a string `event` is sent as a
//     *binary* frame (kind 3, `userBroadcastPush`) with a 7-byte header:
//       [kind, joinRefLen, refLen, topicLen, userEventLen, metaLen, encoding]
//     followed by those UTF-8 fields and then the payload.
//
// Outgoing frames use the JSON array form, which the decoder also accepts.
// `broadcast.self` is honoured implicitly: the sender is in the fan-out.

const wss = new WebSocketServer({ noServer: true });
const topicsBySocket = new Map();

/** Decode a binary `userBroadcastPush` frame into the object form. */
function decodeBinaryPush(buf) {
  if (buf.length < 7 || buf[0] !== 3) return null;
  const [, joinRefLen, refLen, topicLen, eventLen, metaLen, encoding] = buf;
  let o = 7;
  const take = (n) => {
    const s = buf.subarray(o, o + n).toString("utf8");
    o += n;
    return s;
  };
  const join_ref = take(joinRefLen);
  const ref = take(refLen);
  const topic = take(topicLen);
  const userEvent = take(eventLen);
  const metaRaw = take(metaLen);
  const rest = buf.subarray(o);

  let userPayload;
  if (encoding === 1) {
    try {
      userPayload = JSON.parse(rest.toString("utf8"));
    } catch {
      userPayload = {};
    }
  } else {
    userPayload = rest.toString("base64");
  }

  const meta = metaRaw ? JSON.parse(metaRaw) : {};
  return {
    join_ref: join_ref || null,
    ref: ref || null,
    topic,
    event: "broadcast",
    payload: { ...meta, type: "broadcast", event: userEvent, payload: userPayload }
  };
}

/** Frames are positional arrays, not objects. */
function frame(topic, event, payload, ref = null, joinRef = null) {
  return JSON.stringify([joinRef, ref, topic, event, payload]);
}

/** Send a broadcast frame to every socket joined to `topic`. */
function fanout(topic, payload) {
  let delivered = 0;
  for (const [sock, topics] of topicsBySocket) {
    if (sock.readyState === 1 && topics.has(topic)) {
      sock.send(frame(topic, "broadcast", payload));
      delivered++;
    }
  }
  return delivered;
}

server.on("upgrade", (req, socket, head) => {
  if (!req.url.startsWith("/realtime/v1/websocket")) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws) => {
  topicsBySocket.set(ws, new Set());
  log("realtime: client connected");

  ws.on("message", (raw, isBinary) => {
    let msg = null;
    if (isBinary || (Buffer.isBuffer(raw) && raw[0] === 3 && raw.length > 7)) {
      msg = decodeBinaryPush(Buffer.from(raw));
    } else {
      try {
        const arr = JSON.parse(raw.toString());
        // [join_ref, ref, topic, event, payload]
        if (Array.isArray(arr)) {
          const [join_ref, ref, topic, event, payload] = arr;
          msg = { join_ref, ref, topic, event, payload };
        }
      } catch {
        /* ignore malformed frames */
      }
    }
    if (!msg) return;

    const { topic, event, payload, ref, join_ref } = msg;
    const reply = (response = {}) =>
      ws.send(frame(topic, "phx_reply", { status: "ok", response }, ref, join_ref));

    if (event === "phx_join") {
      topicsBySocket.get(ws).add(topic);
      log(`realtime: joined ${topic}`);
      return reply({ postgres_changes: [] });
    }
    if (event === "phx_leave") {
      topicsBySocket.get(ws).delete(topic);
      return reply();
    }
    if (event === "heartbeat" || event === "access_token") return reply();

    if (event === "broadcast") {
      const inner = payload?.event;
      const delivered = fanout(topic, payload);
      log(`realtime: broadcast "${inner}" on ${topic} → ${delivered} subscriber(s)`);
      if (inner === "gist-created") {
        const keys = Object.keys(payload?.payload ?? {}).sort().join(", ");
        log(`   payload fields: [${keys}]`);
      }
      return reply();
    }

    return reply();
  });

  ws.on("close", () => {
    topicsBySocket.delete(ws);
    log("realtime: client disconnected");
  });
});

function log(msg) {
  const t = new Date().toLocaleTimeString();
  console.log(`\x1b[90m[${t}]\x1b[0m ${msg}`);
}

server.listen(PORT, () => {
  console.log(`\nfake-supabase listening on http://localhost:${PORT}`);
  console.log(`  course        : ${course.title?.trim()} (${courseUrl})`);
  console.log(`  course id     : ${COURSE_ID}`);
  console.log(`  educators     : ${EDUCATORS.join(", ")}`);
  console.log(`  roster        : ${roster.map((s) => s.id).join(", ") || "(none)"}`);
  console.log(`  seeded        : ${db.course_gists.length} snippets (1 expired, 1 other-course — both should stay hidden)`);
  console.log(`  dashboard     : http://localhost:5176/${COURSE_ID}/gists\n`);
});
