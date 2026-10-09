import "../../bdd/support/svelte-runes-shim.ts";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Library-specific compatibility seam: mint exactly the JWT claims the previous reader issued.
const fromAdapter = createRequire(new URL("../../../packages/svelte/identity-sveltekit/package.json", import.meta.url));
const { encode } = await import(fromAdapter.resolve("@auth/core/jwt"));

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

import {
  Browser,
  configureReader,
  githubAccount,
  githubKnows,
  openPage,
  privateEnv,
  publicEnv,
  send,
  sessionCookieOf,
  signInThroughGithub
} from "../../bdd/support/reader-auth.ts";

const uuid = "8ef8346c-679d-4498-a969-92a66dd46cdb";
const profile = { login: "alice", name: "Alice", email: "alice@example.com", picture: "https://avatars.example/alice.png" };

async function oldSession(claims: Record<string, unknown> = { sub: uuid, ...profile }) {
  const browser = new Browser();
  const name = "__Secure-authjs.session-token";
  browser.jar.set(name, await encode({ token: claims, salt: name, secret: privateEnv.PRIVATE_AUTH_SECRET!, maxAge: 30 * 24 * 60 * 60 }));
  return browser;
}

describe("Auth.js identity boundary", () => {
  beforeEach(() => {
    configureReader();
    githubKnows(githubAccount("Alice", 12345));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps a previously issued JWT signed in and renews its original cookie", async () => {
    const browser = await oldSession();
    const result = await send(browser, "GET", "/course/web-dev-101");
    expect(result.page).toMatchObject({ loggedIn: true, actor: { subject: `authjs:${uuid}`, login: "alice" }, user: { login: "alice", name: "Alice" } });
    expect(sessionCookieOf(result)).toMatchObject({ name: "__Secure-authjs.session-token", attributes: { httponly: true, secure: true, samesite: "Lax" } });
  });

  it("uses the verified OAuth account's numeric id, independent of login and Auth.js UUID", async () => {
    const browser = new Browser();
    await signInThroughGithub(browser, "/");
    expect((await openPage(browser)).actor).toMatchObject({ subject: "github:12345", login: "alice" });
    githubKnows(githubAccount("Renamed", 12345));
    await signInThroughGithub(browser, "/");
    expect((await openPage(browser)).actor).toMatchObject({ subject: "github:12345", login: "renamed" });
  });

  it("upgrades a legacy session on the next verified GitHub sign-in", async () => {
    const browser = await oldSession();
    await signInThroughGithub(browser, "/");
    expect((await openPage(browser)).actor?.subject).toBe("github:12345");
  });

  it("does not accept identity changes from the session update endpoint", async () => {
    const browser = new Browser();
    await signInThroughGithub(browser, "/");
    const result = await send(browser, "POST", "/auth/session", undefined, { data: { githubId: "666", login: "mallory", sub: "666", name: "Mallory" } });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body).user).toMatchObject({ subject: "github:12345", login: "alice", name: "Alice" });
    expect((await openPage(browser)).actor).toMatchObject({ subject: "github:12345", login: "alice" });
  });

  it.each([
    { ...profile },
    { sub: uuid, ...profile, login: undefined },
    { sub: uuid, ...profile, login: "" },
    { sub: "12345", ...profile },
    { sub: uuid, ...profile, githubId: "invalid" },
    { sub: uuid, ...profile, githubId: "0" },
    { sub: uuid, ...profile, githubId: 12345 }
  ])("returns no actor for incomplete or invalid verified claims: %j", async (claims) => {
    expect((await openPage(await oldSession(claims))).actor).toBeNull();
  });

  it("keeps actors isolated across concurrent requests, including signed-out visitors", async () => {
    const alice = new Browser();
    await signInThroughGithub(alice, "/");
    githubKnows(githubAccount("Bob", 67890));
    const bob = new Browser();
    await signInThroughGithub(bob, "/");
    const pages = await Promise.all([openPage(alice), openPage(bob), openPage(new Browser()), openPage(alice)]);
    expect(pages.map(({ actor }) => actor?.subject ?? null)).toEqual(["github:12345", "github:67890", null, "github:12345"]);
  });

  it.each(["anonymous", "unconfigured"])("resolves no actor in %s mode despite a valid cookie", async (mode) => {
    const browser = await oldSession();
    if (mode === "anonymous") publicEnv.PUBLIC_ANON_MODE = "TRUE";
    else delete privateEnv.PRIVATE_AUTH_SECRET;
    expect((await openPage(browser)).actor).toBeNull();
  });

  it("normalizes optional profile fields at the layout boundary", async () => {
    const browser = await oldSession({ sub: uuid, login: "alice", name: null, email: null, picture: null });
    expect(await openPage(browser)).toMatchObject({ actor: { name: null, email: null, image: null }, user: { name: "alice", email: "", image: "" } });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects an invalid GitHub numeric id during OAuth: %s", async (id) => {
    githubKnows(githubAccount("Alice", id));
    const browser = new Browser();
    await signInThroughGithub(browser, "/");
    expect((await openPage(browser)).actor).toBeNull();
  });
});
