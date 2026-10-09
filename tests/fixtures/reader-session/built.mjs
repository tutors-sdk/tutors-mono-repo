// Proves the production reader's identity seam over HTTP; only GitHub and time are test preloads.
// Run after SVELTEKIT_ADAPTER=node pnpm build: pnpm test:identity:built
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, githubCallback, isSessionCookie, signInRequest } from "../../bdd/support/reader-oauth.mjs";

const reader = fileURLToPath(new URL("../../../apps/reader/", import.meta.url));
const fromKit = createRequire(await realpath(join(reader, "node_modules/@sveltejs/kit/package.json")));
const { unflatten } = await import(fromKit.resolve("devalue"));
const ORIGIN = "https://tutors.test";
const DAY = 86400000;
const initialTime = Date.now();
const temp = await mkdtemp(join(tmpdir(), "tutors-identity-"));
const clockFile = join(temp, "now");
const listener = createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
let server;
let logs = "";
const expected = { subject: "github:1001", login: "student", name: "Student", email: "student@example.com", image: "https://avatars.example/student.png" };

async function stop() {
  if (server?.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
  server = undefined;
}

async function start(overrides = {}) {
  await stop();
  logs = "";
  const env = {
    ...process.env,
    NODE_OPTIONS: "",
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(port),
    PROTOCOL_HEADER: "x-forwarded-proto",
    HOST_HEADER: "x-forwarded-host",
    PUBLIC_ANON_MODE: "FALSE",
    PUBLIC_SUPABASE_URL: "",
    PUBLIC_SUPABASE_ANON_KEY: "",
    PRIVATE_AUTH_SECRET: AUTH_SECRET,
    PRIVATE_AUTH_GITHUB_ID: GITHUB_CLIENT_ID,
    PRIVATE_AUTH_GITHUB_SECRET: GITHUB_CLIENT_SECRET,
    TEST_IDENTITY_CLOCK_FILE: clockFile,
    LOG_LEVEL: "warn",
    ...overrides
  };
  const preload = env.PRIVATE_AUTH_SECRET === AUTH_SECRET ? ["--import", new URL("../../../apps/reader/tests/e2e/oauth-preload.mjs", import.meta.url).href] : [];
  server = spawn(process.execPath, [...preload, "build/index.js"], { cwd: reader, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Reader exited: ${logs}`);
    try {
      if ((await new Browser().send("/healthz/live")).ok) return;
    } catch {
      /* The child has not started listening yet. */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Reader did not start: ${logs}`);
}

function checkHeaders(response) {
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(response.headers.get("permissions-policy"), /camera=\(\).*microphone=\(\)/);
}

class Browser {
  jar = new Map();
  async send(path, body, headers = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        origin: ORIGIN,
        "x-forwarded-proto": "https",
        "x-forwarded-host": "tutors.test",
        ...(this.jar.size ? { cookie: [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    checkHeaders(response);
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0],
        eq = pair.indexOf("=");
      const name = pair.slice(0, eq),
        value = pair.slice(eq + 1);
      if (!value || /max-age=0(?:;|$)/i.test(cookie)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return response;
  }
  async page() {
    const response = await this.send("/auth/__data.json");
    assert.equal(response.status, 200, await response.clone().text());
    const data = await response.json();
    assert.equal(data.type, "data");
    return unflatten(data.nodes[0].data);
  }
  async actor() {
    return (await this.page()).actor;
  }
}

async function authorize(browser, returnTo = "/auth", headers = {}, extra = {}) {
  const request = signInRequest(returnTo);
  return browser.send(request.path, { ...request.json, ...extra }, headers);
}

async function signIn(browser, returnTo = "/auth", code = "student") {
  const started = await authorize(browser, returnTo);
  assert.equal(started.status, 200, await started.clone().text());
  const callback = githubCallback((await started.json()).url, code);
  return browser.send(callback.pathname + callback.search);
}

let count = 0;
async function check(name, run) {
  await run();
  count++;
  process.stdout.write(`PASS reader: ${name}\n`);
}

try {
  await check("no server secrets or provider implementation in client output", async () => {
    const files = await readdir(join(reader, "build/client"), { recursive: true, withFileTypes: true });
    const scripts = files.filter((file) => file.isFile() && file.name.endsWith(".js"));
    assert.ok(scripts.length);
    for (const file of scripts) {
      const source = await readFile(join(file.parentPath, file.name), "utf8");
      for (const secret of [AUTH_SECRET, GITHUB_CLIENT_SECRET, "Identity is owned by GitHub", "Invalid GitHub identity"]) assert.ok(!source.includes(secret), file.name);
    }
  });
  await writeFile(clockFile, String(initialTime));
  await start();
  await check("a session issued by #440 survives cleanup and renews without reauthentication", async () => {
    const previous = JSON.parse(await readFile(new URL("./better-auth-session-before-cleanup.json", import.meta.url), "utf8"));
    assert.equal(previous.origin, ORIGIN);
    await writeFile(clockFile, String(previous.issuedAt + 29 * DAY));
    const returning = new Browser();
    returning.jar = new Map(previous.cookies);
    assert.deepEqual(await returning.actor(), previous.actor);
    await writeFile(clockFile, String(previous.issuedAt + 31 * DAY));
    assert.deepEqual(await returning.actor(), previous.actor);
    await writeFile(clockFile, String(initialTime));
  });
  const browser = new Browser();
  let signedIn;
  await check("0250/0251 GitHub app/scopes/callback and return URL", async () => {
    const started = await authorize(browser);
    assert.equal(started.status, 200, await started.clone().text());
    const url = new URL((await started.json()).url);
    assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), GITHUB_CLIENT_ID);
    assert.deepEqual(url.searchParams.get("scope").split(/[ ,]+/).sort(), ["read:user", "user:email"]);
    assert.equal(url.searchParams.get("redirect_uri"), `${ORIGIN}/api/auth/callback/github`);
    const callback = githubCallback(url.href, "student");
    signedIn = await browser.send(callback.pathname + callback.search);
    assert.equal(signedIn.status, 302);
    assert.equal(new URL(signedIn.headers.get("location"), ORIGIN).href, `${ORIGIN}/auth`);
  });
  await check("0252 verified actor and login-based profile reach the actual root layout", async () => {
    assert.deepEqual(await browser.actor(), expected);
    assert.equal(await new Browser().actor(), null);
    assert.equal((await browser.page()).user.login, "student");
    for (const path of ["/auth", "/auth/reference-course"]) assert.equal((await browser.send(path)).status, 200);
  });
  const initialJar = new Map(browser.jar);
  await check("0253 inactive expiry and rolling renewal survive restart without revival", async () => {
    await writeFile(clockFile, String(initialTime + 29 * DAY));
    const response = await browser.send("/auth/__data.json");
    const renewedCookies = response.headers.getSetCookie().filter((cookie) => isSessionCookie(cookie.split("=")[0]));
    assert.ok(renewedCookies.length);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const renewedJar = new Map(browser.jar);
    for (const cookie of renewedCookies) {
      const expires = /Expires=([^;]+)/i.exec(cookie);
      if (expires) assert.ok(Math.abs(Date.parse(expires[1]) - (initialTime + 59 * DAY)) < 60000);
      else assert.match(cookie, /Max-Age=2592000/i);
    }
    await writeFile(clockFile, String(initialTime + 31 * DAY));
    await start();
    assert.deepEqual(await browser.actor(), expected);
    browser.jar = new Map(initialJar);
    assert.equal(await browser.actor(), null);
    browser.jar = new Map(renewedJar);
    await writeFile(clockFile, String(initialTime + 60 * DAY));
    assert.equal(await browser.actor(), null);
    await writeFile(clockFile, String(initialTime));
    browser.jar = new Map(initialJar);
  });
  await check("0254 each malformed or tampered authentication cookie fails closed", async () => {
    for (const [name, value] of [...initialJar].filter(([name]) => isSessionCookie(name))) {
      for (const forged of ["made-up-cookie", value.slice(0, Math.floor(value.length / 2)) + "!" + value.slice(Math.floor(value.length / 2) + 1)]) {
        const attacker = new Browser();
        attacker.jar = new Map(initialJar);
        attacker.jar.set(name, forged);
        assert.equal(await attacker.actor(), null, name);
      }
    }
  });
  await check("0255 refusal stays on this reader without a session", async () => {
    const denied = new Browser();
    const url = (await (await authorize(denied)).json()).url;
    const callback = githubCallback(url, "student", true);
    const response = await denied.send(callback.pathname + callback.search);
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get("location"), ORIGIN).origin, ORIGIN);
    assert.equal(await denied.actor(), null);
  });
  await check("0259 HTTPS authentication cookies keep HttpOnly/Secure/Lax", async () => {
    const cookies = signedIn.headers.getSetCookie().filter((cookie) => isSessionCookie(cookie.split("=")[0]));
    assert.ok(cookies.length);
    for (const cookie of cookies) for (const flag of [/; HttpOnly(?:;|$)/i, /; Secure(?:;|$)/i, /; SameSite=Lax(?:;|$)/i, /; Path=\/(?:;|$)/i]) assert.match(cookie, flag);
  });
  await check("cross-origin writes and unsafe return URLs cannot leave the reader", async () => {
    assert.equal((await authorize(new Browser(), "/", { origin: "https://attacker.test" })).status, 403);
    const attacker = new Browser();
    const response = await authorize(attacker, "https://attacker.test/");
    assert.equal(response.status, 403);
  });
  await check("protected identity claims cannot be replaced", async () => {
    for (const body of [{ githubId: "666" }, { login: "mallory" }, { githubId: null }, { login: null }, { name: "Mallory", githubId: "666", login: "mallory" }]) {
      assert.equal((await browser.send("/api/auth/update-user", body)).status, 403);
      assert.deepEqual(await browser.actor(), expected);
    }
    const extra = new Browser();
    const url = (await (await authorize(extra, "/auth", {}, { additionalData: { githubId: "666", login: "mallory" } })).json()).url;
    const callback = githubCallback(url, "student");
    await extra.send(callback.pathname + callback.search);
    assert.deepEqual(await extra.actor(), expected);
    assert.deepEqual(await browser.actor(), expected);
  });
  await check("invalid OAuth state and unused account-write endpoints are rejected", async () => {
    const attacker = new Browser();
    const url = (await (await authorize(attacker)).json()).url;
    const callback = githubCallback(url, "student");
    callback.searchParams.set("state", "forged-state");
    const response = await attacker.send(callback.pathname + callback.search);
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get("location"), ORIGIN).origin, ORIGIN);
    assert.equal(await attacker.actor(), null);
    for (const path of ["sign-up/email", "link-social", "update-session", "get-access-token"]) assert.equal((await attacker.send(`/api/auth/${path}`, {})).status, 404);
  });
  await check("concurrent actors stay isolated", async () => {
    const lecturer = new Browser();
    await signIn(lecturer, "/auth", "lecturer");
    const actors = await Promise.all([browser.actor(), lecturer.actor(), new Browser().actor()]);
    assert.equal(actors[0].subject, "github:1001");
    assert.equal(actors[1].subject, "github:1002");
    assert.equal(actors[2], null);
  });
  await check("GitHub rename retains its trusted numeric subject", async () => {
    await start({ TEST_GITHUB_STUDENT_LOGIN: "student-renamed" });
    const renamed = new Browser();
    await signIn(renamed, "/auth", "student-renamed");
    assert.deepEqual(await renamed.actor(), { ...expected, login: "student-renamed" });
    await start();
  });
  await check("0256 logout deletes the browser session and forwards response headers", async () => {
    const response = await browser.send("/api/auth/sign-out", {});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.equal(await browser.actor(), null);
    assert.ok(![...browser.jar.keys()].some(isSessionCookie));
  });
  await check("a production secret rejects fixture-issued cookies without a preload", async () => {
    await start({ NODE_ENV: "production", PRIVATE_AUTH_SECRET: "a-production-secret-distinct-from-the-test-fixture" });
    browser.jar = new Map(initialJar);
    assert.equal(await browser.actor(), null);
  });
  await check("0257 anonymous mode ignores an issued cookie", async () => {
    await start({ PUBLIC_ANON_MODE: "TRUE" });
    browser.jar = new Map(initialJar);
    assert.equal(await browser.actor(), null);
    assert.equal((await browser.send("/auth")).status, 200);
  });
  await check("0258 no secret still serves anonymous pages", async () => {
    await start({ NODE_ENV: "production", PRIVATE_AUTH_SECRET: "" });
    assert.equal(await browser.actor(), null);
    assert.equal((await browser.send("/auth/reference-course")).status, 200);
  });
  await check("trusted proxy headers preserve the public port and reject invalid protocols", async () => {
    await start();
    const portOrigin = "https://tutors.test:8443";
    const response = await new Browser().send("/api/auth/sign-in/social", { provider: "github", callbackURL: "/auth" }, {
      origin: portOrigin, "x-forwarded-host": "tutors.test:8443"
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(new URL((await response.json()).url).searchParams.get("redirect_uri"), `${portOrigin}/api/auth/callback/github`);
    const invalid = await fetch(`http://127.0.0.1:${port}/healthz/live`, { headers: { "x-forwarded-proto": "https://evil.test" } });
    assert.equal(invalid.status, 400);
  });
  process.stdout.write(`\n${count} checks passed against the built Kit 3 reader.\n`);
} catch (error) {
  process.stderr.write(logs);
  throw error;
} finally {
  await stop();
  await rm(temp, { recursive: true, force: true });
}
