import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = "https://tutors.test";
const DAY = 86400000;
const initialTime = Date.now();
const temp = await mkdtemp(join(tmpdir(), "tutors-identity-clock-"));
const clockFile = join(temp, "now");
await writeFile(clockFile, String(initialTime));
const listener = createServer();
listener.listen(0, "127.0.0.1");
await once(listener, "listening");
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
let server;
let serverLogs = "";

async function stop() {
  if (!server) return;
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
  server = undefined;
}

async function start(options = {}) {
  await stop();
  serverLogs = "";
  server = spawn(process.execPath, ["--import", "./runtime.mjs", "build/index.js"], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      PROTOCOL_HEADER: "x-forwarded-proto",
      HOST_HEADER: "x-forwarded-host",
      PRIVATE_AUTH_SECRET: "a-test-secret-that-is-at-least-thirty-two-chars",
      PUBLIC_ANON_MODE: "FALSE",
      SPIKE_FIELD_POLICY: "guarded",
      SPIKE_FORWARD_COOKIES: "1",
      SPIKE_ROLLING_SESSION: "0",
      SPIKE_GITHUB_ID: "1000",
      SPIKE_GITHUB_LOGIN: "alice",
      SPIKE_CLOCK_FILE: clockFile,
      ...options
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.on("data", (chunk) => {
    serverLogs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverLogs += chunk;
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${serverLogs}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/actor`)).ok) return;
    } catch {
      // Connection refusal is expected until the child starts listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not start: ${serverLogs}`);
}

class Browser {
  jar = new Map();
  async send(path, body, headers = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: ORIGIN,
        "x-forwarded-proto": "https",
        "x-forwarded-host": "tutors.test",
        cookie: [...this.jar].map(([name, value]) => `${name}=${value}`).join("; "),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual"
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq),
        value = pair.slice(eq + 1);
      if (!value || /max-age=0(?:;|$)/i.test(cookie)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return response;
  }
  async actor() {
    return (await (await this.send("/actor")).json()).actor;
  }
}

async function authorize(browser, returnTo = "/course/web-dev-101") {
  const started = await browser.send("/api/auth/sign-in/social", {
    provider: "github",
    callbackURL: returnTo,
    errorCallbackURL: "/auth?error=denied",
    additionalData: { githubId: "9999", login: "mallory" }
  });
  assert.equal(started.status, 200, await started.clone().text());
  return new URL((await started.json()).url);
}

function callbackPath(authorizeURL, parameters = {}) {
  const url = new URL(authorizeURL.searchParams.get("redirect_uri"));
  url.searchParams.set("state", authorizeURL.searchParams.get("state"));
  url.searchParams.set("code", "github-code");
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.pathname + url.search;
}

async function signIn(browser, returnTo) {
  const url = await authorize(browser, returnTo);
  return browser.send(callbackPath(url));
}

const results = [];
async function check(name, run) {
  await run();
  results.push(name);
  process.stdout.write(`PASS ${name}\n`);
}

try {
  await check("Server credentials are absent from browser bundles", async () => {
    const files = await readdir("build/client", { recursive: true, withFileTypes: true });
    const scripts = files.filter((file) => file.isFile() && file.name.endsWith(".js"));
    assert.ok(scripts.length > 0);
    for (const file of scripts) {
      const contents = await readFile(join(file.parentPath, file.name), "utf8");
      assert.ok(!contents.includes("tutors-oauth-secret"));
      assert.ok(!contents.includes("a-test-secret-that-is-at-least-thirty-two-chars"));
    }
  });
  await start();
  const browser = new Browser();
  let url;
  await check("0250 GitHub app, scopes and callback", async () => {
    url = await authorize(browser);
    assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), "tutors-oauth-app");
    assert.deepEqual(url.searchParams.get("scope").split(/[ ,]+/).sort(), ["read:user", "user:email"].sort());
    assert.equal(url.searchParams.get("redirect_uri"), `${ORIGIN}/api/auth/callback/github`);
    assert.ok(url.searchParams.get("state"));
  });
  let signedIn;
  await check("0251 approved callback returns to course", async () => {
    signedIn = await browser.send(callbackPath(url));
    assert.equal(signedIn.status, 302, await signedIn.clone().text());
    assert.equal(new URL(signedIn.headers.get("location"), ORIGIN).href, `${ORIGIN}/course/web-dev-101`);
    assert.ok([...browser.jar.keys()].some((name) => name.endsWith("session_token")));
  });
  const expected = { subject: "github:1000", login: "alice", name: "Alice", email: "alice@example.com", image: "https://avatars.example/alice.png" };
  await check("0252 trusted profile reaches pages; anonymous request has no actor", async () => {
    assert.deepEqual(await browser.actor(), expected);
    assert.equal(await new Browser().actor(), null);
    const page = await browser.send("/course/web-dev-101");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /alice/);
  });
  const originalJar = new Map(browser.jar);
  await check("0253 30-day session lifetime", async () => {
    const { expiresAt } = await (await browser.send("/actor")).json();
    assert.ok(Math.abs(Date.parse(expiresAt) - (initialTime + 30 * DAY)) < 60000);
    for (const cookie of signedIn.headers.getSetCookie().filter((c) => /session_(token|data)=/.test(c))) {
      assert.match(cookie, /Max-Age=2592000/i);
    }
    await writeFile(clockFile, String(initialTime + 29 * DAY));
    assert.deepEqual(await browser.actor(), expected);
    browser.jar = new Map(originalJar);
    await writeFile(clockFile, String(initialTime + 31 * DAY));
    assert.equal(await browser.actor(), null);
    await writeFile(clockFile, String(initialTime));
    browser.jar = new Map(originalJar);
  });
  await check("0254 tampered and invented session cookies fail closed", async () => {
    for (const suffix of ["session_token", "session_data"]) {
      const [name, value] = [...originalJar].find(([name]) => name.endsWith(suffix));
      for (const forged of [value.slice(0, Math.floor(value.length / 2)) + "!" + value.slice(Math.floor(value.length / 2) + 1), "made-up-cookie"]) {
        const attacker = new Browser();
        attacker.jar = new Map(originalJar);
        attacker.jar.set(name, forged);
        assert.equal(await attacker.actor(), null);
      }
    }
  });
  await check("0255 refusal redirects safely without a session", async () => {
    const denied = new Browser();
    const url = await authorize(denied);
    const response = await denied.send(callbackPath(url, { error: "access_denied" }));
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get("location"), ORIGIN).origin, ORIGIN);
    assert.equal(await denied.actor(), null);
  });
  await check("0256 sign-out clears cookies and identity", async () => {
    const response = await browser.send("/api/auth/sign-out", { callbackURL: "/" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.equal(await browser.actor(), null);
    assert.ok(![...browser.jar.keys()].some((name) => /session_(token|data)$/.test(name)));
    // GitHub sign-out does not redirect: the identity client must navigate after success.
    assert.equal(response.headers.get("location"), null);
    assert.equal((await browser.send("/")).status, 200);
  });
  await check("0259 secure cookie flags", async () => {
    const sessionCookies = signedIn.headers.getSetCookie().filter((c) => /session_(token|data)=/.test(c));
    assert.equal(sessionCookies.length, 2);
    for (const cookie of sessionCookies) {
      assert.match(cookie, /; HttpOnly(?:;|$)/i);
      assert.match(cookie, /; Secure(?:;|$)/i);
      assert.match(cookie, /; SameSite=Lax(?:;|$)/i);
      assert.match(cookie, /; Path=\/(?:;|$)/i);
    }
  });
  await check("OAuth state and unsafe redirect rejection", async () => {
    const attacker = new Browser();
    const url = await authorize(attacker);
    const response = await attacker.send(callbackPath(url, { state: "forged-state" }));
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get("location"), ORIGIN).origin, ORIGIN);
    assert.equal(await attacker.actor(), null);
    assert.equal((await attacker.send("/api/auth/sign-in/social", { provider: "github", callbackURL: "https://attacker.example" })).status, 403);
    assert.equal((await attacker.send("/api/auth/sign-in/social", { provider: "github", callbackURL: "/" }, { origin: "https://attacker.example" })).status, 403);
  });
  await check("Guard prevents identity changes while allowing profile updates", async () => {
    await signIn(browser);
    for (const body of [{ githubId: "9999" }, { login: "mallory" }, { githubId: null }, { login: null }, { name: "Mallory", githubId: "9999", login: "mallory" }]) {
      assert.equal((await browser.send("/api/auth/update-user", body)).status, 403);
      assert.deepEqual(await browser.actor(), expected);
    }
    assert.equal((await browser.send("/api/auth/update-user", { name: "Alice Updated" })).status, 200);
    assert.deepEqual(await browser.actor(), { ...expected, name: "Alice Updated" });
  });
  await start();
  await signIn(browser);
  const persistedJar = new Map(browser.jar);
  await check("Stateless identity survives server restart", async () => {
    await start();
    browser.jar = new Map(persistedJar);
    assert.deepEqual(await browser.actor(), expected);
  });
  await check("Page session refresh forwards Set-Cookie", async () => {
    await writeFile(clockFile, String(initialTime + 29 * DAY));
    const response = await browser.send("/course/web-dev-101");
    assert.equal(response.status, 200);
    assert.ok(response.headers.getSetCookie().some((c) => /session_data=/.test(c)));
    assert.notEqual([...browser.jar].find(([name]) => name.endsWith("session_data"))[1], [...persistedJar].find(([name]) => name.endsWith("session_data"))[1]);
    await writeFile(clockFile, String(initialTime));
  });
  await check("Default stateless refresh retains hard expiry (rolling-session mismatch)", async () => {
    browser.jar = new Map(persistedJar);
    await writeFile(clockFile, String(initialTime + 29 * DAY));
    assert.deepEqual(await browser.actor(), expected);
    await writeFile(clockFile, String(initialTime + 31 * DAY));
    assert.equal(await browser.actor(), null);
    await writeFile(clockFile, String(initialTime));
  });
  await check("Without cookie plugin page refresh is lost (negative control)", async () => {
    await start({ SPIKE_FORWARD_COOKIES: "0" });
    browser.jar = new Map(persistedJar);
    await writeFile(clockFile, String(initialTime + 29 * DAY));
    const response = await browser.send("/course/web-dev-101");
    assert.equal(response.headers.getSetCookie().length, 0);
    await writeFile(clockFile, String(initialTime));
  });
  await check("0257 anonymous mode ignores valid cookies", async () => {
    await start({ PUBLIC_ANON_MODE: "TRUE" });
    browser.jar = new Map(persistedJar);
    assert.equal(await browser.actor(), null);
    assert.equal((await browser.send("/course/web-dev-101")).status, 200);
  });
  await check("0258 missing secret still serves anonymous pages", async () => {
    await start({ PRIVATE_AUTH_SECRET: "" });
    assert.equal(await browser.actor(), null);
    assert.equal((await browser.send("/course/web-dev-101")).status, 200);
  });
  await check("input:false drops OAuth-mapped identity (negative control)", async () => {
    await start({ SPIKE_FIELD_POLICY: "server-owned" });
    const owner = new Browser();
    assert.equal((await signIn(owner)).status, 302);
    const { user } = await (await owner.send("/api/auth/get-session")).json();
    assert.ok(user.githubId == null);
    assert.ok(user.login == null);
    assert.equal(await owner.actor(), null);
  });
  await check("Unguarded mapped fields can be forged (negative control)", async () => {
    await start({ SPIKE_FIELD_POLICY: "unguarded" });
    const owner = new Browser();
    await signIn(owner);
    assert.equal((await owner.send("/api/auth/update-user", { githubId: "9999", login: "mallory" })).status, 200);
    const actor = await owner.actor();
    assert.equal(actor.subject, "github:9999");
    assert.equal(actor.login, "mallory");
  });
  await check("GitHub rename preserves subject", async () => {
    await start({ SPIKE_GITHUB_LOGIN: "alice-renamed" });
    const renamed = new Browser();
    await signIn(renamed);
    assert.deepEqual(await renamed.actor(), { ...expected, login: "alice-renamed" });
  });
  await check("Rolling hook matches Auth.js renewal without reviving expired sessions", async () => {
    await start({ SPIKE_ROLLING_SESSION: "1" });
    const rolling = new Browser();
    await signIn(rolling);
    const initialJar = new Map(rolling.jar);
    await writeFile(clockFile, String(initialTime + 29 * DAY));
    assert.deepEqual(await rolling.actor(), expected);
    const renewedJar = new Map(rolling.jar);
    const { expiresAt } = await (await rolling.send("/actor")).json();
    assert.ok(Math.abs(Date.parse(expiresAt) - (initialTime + 59 * DAY)) < 60000);
    await writeFile(clockFile, String(initialTime + 31 * DAY));
    assert.deepEqual(await rolling.actor(), expected);
    rolling.jar = new Map(initialJar);
    assert.equal(await rolling.actor(), null);
    rolling.jar = new Map(renewedJar);
    await start({ SPIKE_ROLLING_SESSION: "1" });
    assert.deepEqual(await rolling.actor(), expected);
    rolling.jar = new Map(renewedJar);
    await writeFile(clockFile, String(initialTime + 60 * DAY));
    assert.equal(await rolling.actor(), null);
    await writeFile(clockFile, String(initialTime));
  });
  await check("Rolling configuration preserves identity guards and rejects forged cookies", async () => {
    await start({ SPIKE_ROLLING_SESSION: "1" });
    const guarded = new Browser();
    await signIn(guarded);
    assert.equal((await guarded.send("/api/auth/update-user", { githubId: "9999", login: "mallory" })).status, 403);
    assert.deepEqual(await guarded.actor(), expected);
    const jar = new Map(guarded.jar);
    await start({ SPIKE_ROLLING_SESSION: "1" });
    for (const suffix of ["session_token", "session_data"]) {
      guarded.jar = new Map(jar);
      const [name] = [...jar].find(([name]) => name.endsWith(suffix));
      guarded.jar.set(name, "made-up-cookie");
      assert.equal(await guarded.actor(), null);
    }
  });
  await check("Requests for two stateless identities remain isolated", async () => {
    await start({ SPIKE_GITHUB_ID: "2000", SPIKE_GITHUB_LOGIN: "bob" });
    const bob = new Browser();
    await signIn(bob);
    await start();
    const alice = new Browser();
    alice.jar = new Map(persistedJar);
    const [aliceActor, bobActor] = await Promise.all([alice.actor(), bob.actor()]);
    assert.equal(aliceActor.subject, "github:1000");
    assert.equal(aliceActor.login, "alice");
    assert.equal(bobActor.subject, "github:2000");
    assert.equal(bobActor.login, "bob");
  });
  process.stdout.write(`\n${results.length} compatibility checks passed against the built Kit 3 app.\n`);
} catch (error) {
  process.stderr.write(serverLogs);
  throw error;
} finally {
  await stop();
  await rm(temp, { recursive: true, force: true });
}
