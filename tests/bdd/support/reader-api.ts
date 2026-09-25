import { vi } from "vitest";
import type { TutorsId } from "../../../packages/jsr/model/src/tutors.ts";

/**
 * The reader's server, as a browser reaches it. Requests to `/api/...` are dispatched to the real
 * route modules under apps/reader/src/routes/api (their `GET`, `PUT`, ... exports), with the
 * Auth.js session of whoever is signed in to the reader in this scenario. Only three things are
 * stand-ins: the session (Auth.js owns the GitHub round trip), the database (the Supabase recorder)
 * and the course host that serves tutors.json.
 *
 * A request to a route that does not exist answers 404, so a scenario written before its route
 * fails on the status it expected, not on an import.
 *
 * The session travels as the browser would send the reader's cookie: always on a same-origin
 * request (`/api/...`), and on a cross-origin one (`https://reader.test/api/...` from the time
 * dashboard) only when the request asks for `credentials: "include"`.
 */

export const READER_ORIGIN = "https://reader.test";

type Handler = (event: unknown) => Response | Promise<Response>;
type RouteModule = Record<string, Handler | unknown>;

const routeModules = import.meta.glob<RouteModule>("../../../apps/reader/src/routes/api/**/+server.ts");

/** `/api/time/[courseId]` → a matcher and the parameter names. */
const routes = Object.entries(routeModules).map(([file, load]) => {
  const id = file.replace(/^.*\/apps\/reader\/src\/routes/, "").replace(/\/\+server\.ts$/, "");
  const names: string[] = [];
  const pattern = id.replace(/\[([^\]]+)\]/g, (_m, name: string) => {
    names.push(name);
    return "([^/]+)";
  });
  return { id, load, names, regex: new RegExp(`^${pattern}$`) };
});

let session: TutorsId | null = null;

/** Who the reader's Auth.js session says is signed in; null for nobody. */
export function setReaderSession(user: TutorsId | null): void {
  session = user;
}

export type ApiRequest = { method: string; url: string; credentials?: RequestCredentials; origin: string | null; sessionLogin: string | null; status: number };

/** Every request the browser made to the reader's /api, oldest first. */
export const apiRequests: ApiRequest[] = [];

/** Requests to the reader still being answered. */
const inFlight = new Set<Promise<unknown>>();

/** Whether a request to the reader is still being answered. */
export function readerBusy(): boolean {
  return inFlight.size > 0;
}

/** Resolves once no request to the reader is in flight, including requests started while waiting. */
export async function readerIdle(): Promise<void> {
  while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
}

/** Tutors.json files the course host serves, by course id. */
const courseHost = new Map<string, unknown>();

export function serveCourseJson(courseId: string, json: unknown): void {
  courseHost.set(courseId, json);
}

export function resetReaderApi(): void {
  session = null;
  inFlight.clear();
  apiRequests.length = 0;
  courseHost.clear();
}

/** A SvelteKit `error(...)` thrown by a handler, as the framework would answer it. */
function httpErrorResponse(thrown: unknown): Response | null {
  const e = thrown as { status?: unknown; body?: { message?: unknown } };
  if (typeof e?.status !== "number" || !e.body) return null;
  return new Response(JSON.stringify({ message: e.body.message }), { status: e.status, headers: { "content-type": "application/json" } });
}

/** Dispatches one request to the reader's route modules. */
async function callReader(request: Request, withSession: boolean): Promise<Response> {
  const url = new URL(request.url);
  const route = routes.find((r) => r.regex.test(url.pathname));
  if (!route) return new Response("Not Found", { status: 404 });
  const module = await route.load();
  const handler = module[request.method] as Handler | undefined;
  if (typeof handler !== "function") return new Response("Method Not Allowed", { status: 405 });
  const values = route.regex.exec(url.pathname)!.slice(1);
  const params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(values[i])]));
  const user = withSession ? session : null;
  const locals = {
    locale: "en",
    auth: async () => (user ? { user: { login: user.login, name: user.name, email: user.email, image: user.image }, expires: "2099-01-01T00:00:00Z" } : null)
  };
  try {
    return await handler({ request, url, params, locals, fetch: globalThis.fetch, route: { id: route.id }, setHeaders: () => {} });
  } catch (thrown) {
    const response = httpErrorResponse(thrown);
    if (response) return response;
    throw thrown;
  }
}

function courseJsonResponse(url: URL): Response | null {
  const match = /^([a-z0-9-]+)\.netlify\.app$/i.exec(url.hostname);
  if (!match || url.pathname !== "/tutors.json") return null;
  const json = courseHost.get(match[1]);
  return json === undefined ? new Response("Not Found", { status: 404 }) : new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
}

/**
 * Installs a global `fetch` that routes the reader's /api and the course host to the stand-ins above
 * and passes anything else to the `fetch` that was installed before it.
 */
export function installReaderFetch(): void {
  // Installing twice must not chain one router behind another.
  const current = globalThis.fetch as typeof fetch & { fallback?: typeof fetch };
  const previous = current.fallback ?? current;
  const readerFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const sameOrigin = raw.startsWith("/");
    const url = new URL(raw, READER_ORIGIN);
    const course = courseJsonResponse(url);
    if (course) return course;
    if (url.origin !== READER_ORIGIN || !url.pathname.startsWith("/api/")) return previous(input, init);

    const origin = sameOrigin ? null : "https://time.test";
    const headers = new Headers(init?.headers);
    if (origin) headers.set("origin", origin);
    const request = new Request(url, { method: init?.method ?? "GET", headers, body: init?.body });
    const withSession = sameOrigin || init?.credentials === "include";
    const answering = callReader(request, withSession);
    inFlight.add(answering);
    const response = await answering.finally(() => inFlight.delete(answering));
    apiRequests.push({ method: request.method, url: url.pathname, credentials: init?.credentials, origin, sessionLogin: withSession ? (session?.login ?? null) : null, status: response.status });
    return response;
  };
  vi.stubGlobal("fetch", Object.assign(readerFetch, { fallback: previous }));
}

/** A same-origin JSON request from the reader's own pages. */
export function readerRequest(method: string, path: string, body?: unknown): Promise<Response> {
  return globalThis.fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
