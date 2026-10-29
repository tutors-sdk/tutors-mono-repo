// Identity stub: a GitHub-OAuth-shaped issuer with fixed users per role, so
// signed-in journeys run against both sides with identical sessions.
//
// The reader's Auth.js GitHub provider talks to github.com and api.github.com
// by name, so the stub impersonates both: the app containers resolve those
// names to this container (compose `extra_hosts`) and trust its certificate
// (NODE_EXTRA_CA_CERTS=certs/ca.pem); the harness's browser is routed here by
// Playwright. Nothing about the app changes.
//
//   node fixtures/identity/stub.mjs                 # HTTPS on 443 with certs/server.pem
//   HARNESS_ROLE=lecturer                           # which fixed user authorize hands out
//
//   GET  /login/oauth/authorize?redirect_uri&state  -> 302 redirect_uri?code=<role>&state
//   POST /login/oauth/access_token                  -> {"access_token":"tok-<role>", ...}
//   GET  /user            (Bearer tok-<role>)       -> fixed profile
//   GET  /user/emails                               -> [{email, primary, verified}]
//   POST /_harness/fault {"mode":"down"|"off"}       -> while down, the token and user calls answer 503: GitHub
//                                                      failing behind the reader's back (added in the monorepo's
//                                                      copy, tests/e2e-stack, for Rule 0617)
//   GET  https://harness-rules.netlify.app/tutors.json -> the signed-in course's tutors.json from COURSE_ORIGIN: the
//                                                      reader's enrollment export reads the course from Netlify by
//                                                      name, so the stack resolves that name here too (monorepo copy,
//                                                      for the authorisation matrix, Rule 0621)
//
// Deterministic by construction: no ids, no timestamps, no Date header.
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const certs = process.env.CERTS_DIR ?? join(here, "certs");
const port = Number(process.env.PORT ?? 443);
const defaultRole = process.env.HARNESS_ROLE ?? "student";
const courseOrigin = process.env.COURSE_ORIGIN;
const publicCourseOrigin = process.env.PUBLIC_COURSE_ORIGIN;
let fault = "off";

/** Fixed users per role. Ids are stable so anything keyed by them is comparable across sides. */
export const USERS = {
  student: { id: 100001, login: "harness-student", name: "Harness Student", email: "student@harness.test", avatar_url: "https://identity.harness.test/avatar/student.png" },
  enrolled: { id: 100002, login: "harness-enrolled", name: "Harness Enrolled Student", email: "enrolled@harness.test", avatar_url: "https://identity.harness.test/avatar/enrolled.png" },
  lecturer: { id: 100003, login: "harness-lecturer", name: "Harness Lecturer", email: "lecturer@harness.test", avatar_url: "https://identity.harness.test/avatar/lecturer.png" },
  owner: { id: 100004, login: "harness-owner", name: "Harness Course Owner", email: "owner@harness.test", avatar_url: "https://identity.harness.test/avatar/owner.png" },
  admin: { id: 100005, login: "harness-admin", name: "Harness Admin", email: "admin@harness.test", avatar_url: "https://identity.harness.test/avatar/admin.png" }
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function roleFromToken(req) {
  const auth = req.headers.authorization ?? "";
  const match = /^(?:bearer|token)\s+tok-([a-z]+)$/i.exec(auth);
  return match && USERS[match[1]] ? match[1] : undefined;
}

export function handler(req, res) {
  res.sendDate = false;
  const url = new URL(req.url ?? "/", "https://github.com");
  const json = (status, body) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/healthz") return json(200, { status: "ok" });
  const courseName = /^(harness-rules|harness-public)\.netlify\.app(?::\d+)?$/.exec(req.headers.host ?? "")?.[1];
  const origin = courseName === "harness-rules" ? courseOrigin : courseName === "harness-public" ? publicCourseOrigin : undefined;
  if (origin && url.pathname === "/tutors.json") {
    fetch(`${origin}/tutors.json`)
      .then(async (r) => {
        res.writeHead(r.status, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(await r.text());
      })
      .catch(() => json(502, { message: "course origin unreachable" }));
    return;
  }

  if (url.pathname === "/_harness/fault" && req.method === "POST") {
    return readBody(req).then((body) => {
      let mode;
      try {
        mode = JSON.parse(body).mode;
      } catch {
        mode = undefined;
      }
      if (mode !== "down" && mode !== "off") return json(400, { error: 'mode must be "down" or "off"' });
      fault = mode;
      res.writeHead(204);
      res.end();
    });
  }
  if (fault === "down" && url.pathname !== "/login/oauth/authorize") return json(503, { message: "GitHub is unavailable (fault injected)" });

  if (url.pathname === "/login/oauth/authorize") {
    const redirect = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state") ?? "";
    // login_hint lets a journey pick a role per sign-in; otherwise the stub's default.
    const role = USERS[url.searchParams.get("login_hint") ?? ""] ? url.searchParams.get("login_hint") : defaultRole;
    if (!redirect) return json(400, { error: "redirect_uri required" });
    const target = new URL(redirect);
    target.searchParams.set("code", `code-${role}`);
    if (state) target.searchParams.set("state", state);
    res.writeHead(302, { location: target.toString(), "cache-control": "no-store" });
    return res.end();
  }

  if (url.pathname === "/login/oauth/access_token" && req.method === "POST") {
    return readBody(req).then((body) => {
      const params = new URLSearchParams(body);
      const code = params.get("code") ?? new URL(`https://x/?${body}`).searchParams.get("code") ?? "";
      const role = /^code-([a-z]+)$/.exec(code)?.[1];
      if (!role || !USERS[role]) return json(400, { error: "bad_verification_code" });
      return json(200, { access_token: `tok-${role}`, token_type: "bearer", scope: "read:user,user:email" });
    });
  }

  if (url.pathname === "/user") {
    const role = roleFromToken(req);
    if (!role) return json(401, { message: "Bad credentials" });
    return json(200, USERS[role]);
  }
  if (url.pathname === "/user/emails") {
    const role = roleFromToken(req);
    if (!role) return json(401, { message: "Bad credentials" });
    return json(200, [{ email: USERS[role].email, primary: true, verified: true, visibility: "public" }]);
  }
  return json(404, { message: "Not Found" });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createServer({ key: readFileSync(join(certs, "server.key")), cert: readFileSync(join(certs, "server.pem")) }, handler);
  // A container log line, as the stack's other services write.
  // eslint-disable-next-line no-console
  server.listen(port, "0.0.0.0", () => console.log(JSON.stringify({ level: "info", message: "identity stub listening", port, defaultRole })));
}
