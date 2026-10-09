import "../../bdd/support/svelte-runes-shim.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  process.env.LOG_LEVEL = "warn";
});
vi.mock("$env/dynamic/private", () => import("../../bdd/support/reader-auth.ts").then(({ privateEnv }) => ({ env: privateEnv })));
vi.mock("$env/dynamic/public", () => import("../../bdd/support/reader-auth.ts").then(({ publicEnv }) => ({ env: publicEnv })));
vi.mock("$lib/server/auth-mode", () => import("../../../apps/reader/src/lib/server/auth-mode.ts"));
vi.mock("../../../apps/reader/node_modules/@sveltejs/kit/src/exports/hooks/index.js", () => ({
  sequence:
    (...handles: Array<(input: { event: unknown; resolve: (event: unknown) => unknown }) => unknown>) =>
    ({ event, resolve }: { event: unknown; resolve: (event: unknown) => unknown }) =>
      handles.reduceRight<(event: unknown) => unknown>((next, handle) => (event) => handle({ event, resolve: next }), resolve)(event)
}));

import { Browser, configureReader, githubAccount, githubKnows, openPage, privateEnv, send, startSignIn, signInThroughGithub } from "../../bdd/support/reader-auth.ts";

describe("Better Auth identity boundary", () => {
  beforeEach(() => {
    configureReader("better-auth");
    githubKnows(githubAccount("Alice", 12345));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the trusted numeric subject across a GitHub rename", async () => {
    const browser = new Browser();
    await signInThroughGithub(browser, "/");
    expect((await openPage(browser)).actor).toMatchObject({ subject: "github:12345", login: "alice" });
    githubKnows(githubAccount("Renamed", 12345));
    await signInThroughGithub(browser, "/");
    expect((await openPage(browser)).actor).toMatchObject({ subject: "github:12345", login: "renamed" });
  });

  it.each([{ githubId: "666" }, { login: "mallory" }, { githubId: null }, { login: null }, { name: "Mallory", githubId: "666", login: "mallory" }])(
    "rejects protected identity fields, including null and mixed updates: %j",
    async (body) => {
      const browser = new Browser();
      await signInThroughGithub(browser, "/");
      expect((await send(browser, "POST", "/api/auth/update-user", undefined, body)).status).toBe(403);
      expect((await openPage(browser)).actor).toMatchObject({ subject: "github:12345", login: "alice", name: "Alice" });
    }
  );

  it("allows a display-name update without changing the GitHub identity", async () => {
    const browser = new Browser();
    await signInThroughGithub(browser, "/");
    expect((await send(browser, "POST", "/api/auth/update-user", undefined, { name: "Alice Updated" })).status).toBe(200);
    expect((await openPage(browser)).actor).toMatchObject({ subject: "github:12345", login: "alice", name: "Alice Updated" });
  });

  it("ignores OAuth additionalData that attempts to forge the provider identity", async () => {
    const browser = new Browser();
    const started = await send(browser, "POST", "/api/auth/sign-in/social", undefined, {
      provider: "github",
      callbackURL: "/",
      additionalData: { githubId: "666", login: "mallory" }
    });
    const { githubCallback } = await import("../../bdd/support/reader-oauth.mjs");
    const callback = githubCallback(started.location!);
    await send(browser, "GET", callback.pathname + callback.search);
    expect((await openPage(browser)).actor).toMatchObject({ subject: "github:12345", login: "alice" });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects an invalid numeric GitHub id: %s", async (id) => {
    githubKnows(githubAccount("Alice", id));
    const browser = new Browser();
    await signInThroughGithub(browser, "/");
    expect((await openPage(browser)).actor).toBeNull();
  });

  it("enforces origin and redirect checks even in the test runtime", async () => {
    for (const body of [
      { provider: "github", callbackURL: "https://attacker.test" },
      { provider: "github", errorCallbackURL: "//attacker.test" }
    ]) {
      expect((await send(new Browser(), "POST", "/api/auth/sign-in/social", undefined, body)).status).toBe(403);
    }
    expect((await send(new Browser(), "POST", "/api/auth/sign-in/social", undefined, { provider: "github", callbackURL: "/" }, { origin: "https://attacker.test" })).status).toBe(
      403
    );
  });

  it.each(["primitive", 42, null])("rejects malformed update bodies without a server error: %j", async (body) => {
    const browser = new Browser();
    await signInThroughGithub(browser, "/");
    const response = await send(browser, "POST", "/api/auth/update-user", undefined, body);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("does not extend the embedded expiry when refresh is explicitly disabled", async () => {
    const browser = new Browser();
    await signInThroughGithub(browser, "/");
    const original = JSON.parse((await send(browser, "GET", "/api/auth/get-session?disableRefresh=true")).body);
    vi.useFakeTimers({ now: Date.now() + 29 * 86400000, toFake: ["Date"] });
    const later = JSON.parse((await send(browser, "GET", "/api/auth/get-session?disableRefresh=true")).body);
    expect(later.session.expiresAt).toBe(original.session.expiresAt);
  });

  it("keeps concurrent signed-in and signed-out requests isolated", async () => {
    const alice = new Browser();
    await signInThroughGithub(alice, "/");
    githubKnows(githubAccount("Bob", 67890));
    const bob = new Browser();
    await signInThroughGithub(bob, "/");
    const pages = await Promise.all([openPage(alice), openPage(bob), openPage(new Browser()), openPage(alice)]);
    expect(pages.map(({ actor }) => actor?.subject ?? null)).toEqual(["github:12345", "github:67890", null, "github:12345"]);
  });

  it("never falls back to Auth.js, including after a malformed Better Auth cookie", async () => {
    configureReader();
    const browser = new Browser();
    await signInThroughGithub(browser, "/");
    configureReader("better-auth");
    browser.jar.set("__Secure-better-auth.session_data", "forged");
    expect((await openPage(browser)).actor).toBeNull();
    expect([...browser.jar.keys()].some((name) => name.includes("authjs."))).toBe(false);
  });

  it("clears retired Better Auth cookies when switching back to Auth.js", async () => {
    const browser = new Browser();
    await signInThroughGithub(browser, "/");
    configureReader("authjs");
    expect((await openPage(browser)).actor).toBeNull();
    expect([...browser.jar.keys()].some((name) => name.includes("better-auth."))).toBe(false);
  });

  it("rejects an invalid adapter flag and defaults an omitted flag to Auth.js", async () => {
    privateEnv.PRIVATE_AUTH_ADAPTER = "typo";
    await expect(openPage(new Browser())).rejects.toThrow("PRIVATE_AUTH_ADAPTER");
    delete privateEnv.PRIVATE_AUTH_ADAPTER;
    expect((await startSignIn(new Browser(), "/")).location).toContain("%2Fauth%2Fcallback%2Fgithub");
  });

  it.each(["sign-up/email", "sign-in/email", "link-social", "unlink-account", "change-email", "update-session", "get-access-token", "delete-user"])(
    "does not expose the unused SDK endpoint %s",
    async (path) => {
      expect((await send(new Browser(), "POST", `/api/auth/${path}`, undefined, {})).status).toBe(404);
    }
  );
});
