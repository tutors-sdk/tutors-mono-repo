import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/static/private", () => ({ PRIVATE_AUTH_SECRET: "test-secret" }));

const dynamicEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: dynamicEnv }));
vi.mock("$app/environment", () => ({ dev: false }));

const getToken = vi.hoisted(() => vi.fn());
vi.mock("@auth/core/jwt", () => ({ getToken }));

import { getSessionIdentity } from "../../../apps/reader/src/lib/auth";
import type { RequestEvent } from "@sveltejs/kit";

/**
 * Identity read for the snippet share route (issue #155).
 *
 * `POST /api/gists` parses its JSON body *before* asking who the caller is, so
 * by the time this runs the request body is already consumed. That ordering is
 * the thing under test: a `Request` whose body has been read cannot be cloned,
 * and getting it wrong turns every share — signed in or not — into a 500.
 */

function makeEvent(opts: { url?: string; body?: string; cookie?: string } = {}): RequestEvent {
  const url = new URL(opts.url ?? "http://localhost:5173/api/gists");
  const request = new Request(url, {
    method: "POST",
    headers: opts.cookie ? { cookie: opts.cookie } : {},
    body: opts.body ?? JSON.stringify({ courseId: "c", filename: "f", content: "x" })
  });
  return { url, request } as unknown as RequestEvent;
}

beforeEach(() => {
  getToken.mockReset();
  for (const key of Object.keys(dynamicEnv)) delete dynamicEnv[key];
});

describe("getSessionIdentity", () => {
  it("works after the route has already read the request body", async () => {
    const event = makeEvent();
    await event.request.json(); // exactly what POST /api/gists does first
    getToken.mockResolvedValue({ login: "student1", name: "Ada", picture: "https://img" });

    await expect(getSessionIdentity(event)).resolves.toEqual({
      login: "student1",
      name: "Ada",
      image: "https://img"
    });
  });

  it("passes only headers to getToken, never the Request", async () => {
    const event = makeEvent({ cookie: "authjs.session-token=abc" });
    await event.request.json();
    getToken.mockResolvedValue({ login: "student1" });

    await getSessionIdentity(event);
    const [params] = getToken.mock.calls[0];
    expect(params.req).not.toBeInstanceOf(Request);
    expect(params.req.headers.get("cookie")).toBe("authjs.session-token=abc");
  });

  it("returns null when there is no session", async () => {
    getToken.mockResolvedValue(null);
    expect(await getSessionIdentity(makeEvent())).toBeNull();
  });

  it("returns null for a token carrying no login", async () => {
    getToken.mockResolvedValue({ name: "Ada" });
    expect(await getSessionIdentity(makeEvent())).toBeNull();
  });

  it("defaults missing name and picture to null", async () => {
    getToken.mockResolvedValue({ login: "student1" });
    expect(await getSessionIdentity(makeEvent())).toEqual({
      login: "student1",
      name: null,
      image: null
    });
  });

  describe("cookie selection", () => {
    it("uses the __Secure- prefixed cookie over https", async () => {
      getToken.mockResolvedValue(null);
      await getSessionIdentity(makeEvent({ url: "https://reader.example.com/api/gists" }));
      const [params] = getToken.mock.calls[0];
      expect(params.cookieName).toBe("__Secure-authjs.session-token");
      expect(params.secureCookie).toBe(true);
    });

    it("uses the unprefixed cookie over http", async () => {
      getToken.mockResolvedValue(null);
      await getSessionIdentity(makeEvent());
      const [params] = getToken.mock.calls[0];
      expect(params.cookieName).toBe("authjs.session-token");
      expect(params.secureCookie).toBe(false);
    });
  });
});
