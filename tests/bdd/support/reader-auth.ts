import { vi } from "vitest";

/**
 * Drives the reader's sign-in over HTTP, the way a browser and GitHub would, so the
 * Rules in `features/shared/sign-in-session.feature` hold whichever library the reader
 * signs people in with (issue #416).
 *
 * Product code runs from `apps/reader/src/hooks.server.ts` down: the request logger,
 * the auth mode switch, the auth library and the root layout's `load`. The seams are
 * SvelteKit itself (`sequence` and the request event), `$env`, and GitHub, whose
 * OAuth and API endpoints answer from `githubAccount` through a stubbed `fetch`.
 *
 * Moving to another auth library should only change what is marked `library-specific`
 * below. The feature file and its steps stay as they are.
 */

export const READER_ORIGIN = "https://tutors.test";
export const GITHUB_CLIENT_ID = "tutors-oauth-app";

/** The reader's private and public env, read on every request. Steps change them to switch modes. */
export const privateEnv: Record<string, string | undefined> = {};
export const publicEnv: Record<string, string | undefined> = {};

export function configureReader(): void {
  Object.assign(privateEnv, {
    PRIVATE_AUTH_SECRET: "a-test-secret-that-is-at-least-thirty-two-chars",
    PRIVATE_AUTH_GITHUB_ID: GITHUB_CLIENT_ID,
    PRIVATE_AUTH_GITHUB_SECRET: "tutors-oauth-secret"
  });
  Object.assign(publicEnv, { PUBLIC_ANON_MODE: "FALSE" });
}

/** A GitHub account as GitHub's `/user` endpoint returns it. */
export type GithubAccount = { id: number; login: string; name: string; email: string; avatar_url: string };

export function githubAccount(name: string, id = 1000): GithubAccount {
  const login = name.toLowerCase();
  return { id, login, name, email: `${login}@example.com`, avatar_url: `https://avatars.example/${login}.png` };
}

/** One cookie as the reader set it, with its attributes. */
export type SetCookie = { name: string; value: string; attributes: Record<string, string | true> };

export function parseSetCookie(header: string): SetCookie {
  const [pair, ...attrs] = header.split(";").map((part) => part.trim());
  const eq = pair.indexOf("=");
  const attributes: Record<string, string | true> = {};
  for (const attr of attrs) {
    const i = attr.indexOf("=");
    if (i < 0) attributes[attr.toLowerCase()] = true;
    else attributes[attr.slice(0, i).toLowerCase()] = attr.slice(i + 1);
  }
  return { name: pair.slice(0, eq), value: decodeURIComponent(pair.slice(eq + 1)), attributes };
}

/** What the reader answered: status, where it sends the browser, and the cookies it set. */
export type ReaderResponse = { status: number; location: string | null; cookies: SetCookie[]; body: string };

/** A browser's cookie jar for the reader's origin. */
export class Browser {
  jar = new Map<string, string>();

  keep(response: ReaderResponse): void {
    for (const cookie of response.cookies) {
      const expired = cookie.value === "" || cookie.attributes["max-age"] === "0" || (typeof cookie.attributes.expires === "string" && Date.parse(cookie.attributes.expires) <= Date.now());
      if (expired) this.jar.delete(cookie.name);
      else this.jar.set(cookie.name, cookie.value);
    }
  }

  header(): string {
    return [...this.jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
  }
}

let github: GithubAccount | null = null;
let githubRefuses = false;

/** GitHub's side of the OAuth round trip: it knows one account, and either grants or refuses. */
export function githubKnows(account: GithubAccount | null, { refuses = false } = {}): void {
  github = account;
  githubRefuses = refuses;
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: { method?: string }) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://github.com" && url.pathname === "/login/oauth/access_token") {
      if (githubRefuses || !github) return Response.json({ error: "bad_verification_code" }, { status: 400 });
      return Response.json({ access_token: "gho_test", token_type: "bearer", scope: "read:user,user:email" });
    }
    if (url.origin === "https://api.github.com" && url.pathname === "/user" && github) return Response.json(github);
    if (url.origin === "https://api.github.com" && url.pathname === "/user/emails" && github) {
      return Response.json([{ email: github.email, primary: true, verified: true }]);
    }
    throw new Error(`unexpected request from the reader to ${url} (${init?.method ?? "GET"})`);
  });
}

type Handle = (input: { event: unknown; resolve: (event: unknown) => Promise<Response> }) => Promise<Response>;
type LayoutLoad = (input: { locals: Record<string, unknown> }) => Promise<{ loggedIn: boolean; user?: Record<string, unknown> }>;

async function reader(): Promise<{ handle: Handle; load: LayoutLoad }> {
  const hooks = await import("../../../apps/reader/src/hooks.server.ts");
  const layout = await import("../../../apps/reader/src/routes/+layout.server.ts");
  return { handle: hooks.handle as unknown as Handle, load: layout.load as unknown as LayoutLoad };
}

/** What the root layout hands the page, captured when a request reaches SvelteKit's router. */
export type PageData = { loggedIn: boolean; user?: Record<string, unknown> };

export async function send(
  browser: Browser,
  method: "GET" | "POST",
  path: string,
  form?: Record<string, string>
): Promise<ReaderResponse & { page?: PageData }> {
  const { handle, load } = await reader();
  const url = new URL(path, READER_ORIGIN);
  const headers = new Headers({ origin: READER_ORIGIN });
  const cookie = browser.header();
  if (cookie) headers.set("cookie", cookie);
  let body: string | undefined;
  if (form) {
    headers.set("content-type", "application/x-www-form-urlencoded");
    // library-specific: Auth.js's client asks for the redirect as JSON rather than a 302.
    headers.set("x-auth-return-redirect", "1");
    body = new URLSearchParams(form).toString();
  }
  const request = new Request(url, { method, headers, body });
  // SvelteKit's `event.cookies`: what the hooks set here reaches the browser as Set-Cookie.
  const pageCookies: SetCookie[] = [];
  const cookies = {
    get: (name: string) => browser.jar.get(name),
    getAll: () => [...browser.jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      const attributes: Record<string, string | true> = {};
      if (options.httpOnly) attributes.httponly = true;
      if (options.secure) attributes.secure = true;
      if (options.sameSite) attributes.samesite = String(options.sameSite);
      if (options.maxAge !== undefined) attributes["max-age"] = String(options.maxAge);
      if (options.expires instanceof Date) attributes.expires = options.expires.toUTCString();
      pageCookies.push({ name, value, attributes });
    },
    delete: (name: string) => pageCookies.push({ name, value: "", attributes: { "max-age": "0" } })
  };
  const event = { url, request, cookies, locals: {} as Record<string, unknown>, params: {}, route: { id: null }, getClientAddress: () => "127.0.0.1", setHeaders() {}, isDataRequest: false, isSubRequest: false };
  let page: PageData | undefined;
  const response = await handle({
    event,
    resolve: async (resolved) => {
      page = await load({ locals: (resolved as typeof event).locals });
      return new Response("<html></html>", { headers: { "content-type": "text/html" } });
    }
  });
  const text = await response.text();
  let location = response.headers.get("location");
  if (!location && response.headers.get("content-type")?.includes("application/json")) {
    location = (JSON.parse(text) as { url?: string }).url ?? null;
  }
  const result = { status: response.status, location, cookies: [...response.headers.getSetCookie().map(parseSetCookie), ...pageCookies], body: text, page };
  browser.keep(result);
  return result;
}

// library-specific: Auth.js's routes under basePath "/auth".
export const startSignIn = (browser: Browser, returnTo: string) => send(browser, "POST", "/auth/signin/github", { callbackUrl: returnTo });
export const signOut = (browser: Browser, returnTo: string) => send(browser, "POST", "/auth/signout", { callbackUrl: returnTo });

/** GitHub sends the browser back to the reader's callback, with a code or with the refusal. */
export function returnFromGithub(browser: Browser, authorizeUrl: string, { refused = false } = {}) {
  const callback = new URL(new URL(authorizeUrl).searchParams.get("redirect_uri")!);
  if (refused) callback.searchParams.set("error", "access_denied");
  else callback.searchParams.set("code", "github-code");
  return send(browser, "GET", callback.pathname + callback.search);
}

/** Starts sign-in from `returnTo`, approves it on GitHub and follows GitHub back to the reader. */
export async function signInThroughGithub(browser: Browser, returnTo: string) {
  const started = await startSignIn(browser, returnTo);
  return returnFromGithub(browser, started.location!);
}

/** The page data a browser gets on its next page load. */
export async function openPage(browser: Browser, path = "/"): Promise<PageData> {
  const { page } = await send(browser, "GET", path);
  return page!;
}

/** The cookie that holds the session. library-specific: Auth.js names it `*authjs.session-token`. */
export function sessionCookieOf(response: ReaderResponse): SetCookie | undefined {
  return response.cookies.find((cookie) => cookie.name.endsWith("authjs.session-token") && cookie.value !== "");
}

export function sessionInJar(browser: Browser): [string, string] | undefined {
  return [...browser.jar].find(([name]) => name.endsWith("authjs.session-token"));
}
