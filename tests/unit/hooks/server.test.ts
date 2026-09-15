import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("@tutors/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  addTransport: vi.fn(),
  removeTransport: vi.fn()
}));

import log from "@tutors/logger";
import { securityHeaders, SECURITY_HEADERS, createServerErrorHandler } from "@tutors/hooks/server";

const EXPECTED_HEADERS = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

function fakeEvent(): RequestEvent {
  return { request: new Request("https://tutors.dev/") } as unknown as RequestEvent;
}

describe("shared server hooks: securityHeaders", () => {
  it("applies every security header to the resolved response", async () => {
    const response = await securityHeaders({ event: fakeEvent(), resolve: async () => new Response("ok") });
    for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it("exposes the same header set as SECURITY_HEADERS", () => {
    expect(SECURITY_HEADERS).toEqual(EXPECTED_HEADERS);
  });

  it("resolves the event exactly once and preserves the body and status", async () => {
    const resolve = vi.fn(async () => new Response("payload", { status: 201 }));
    const event = fakeEvent();
    const response = await securityHeaders({ event, resolve });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(event);
    expect(response.status).toBe(201);
    expect(await response.text()).toBe("payload");
  });

  it("overrides a weaker value set further down the chain", async () => {
    const resolve = async () => new Response("ok", { headers: { "X-Frame-Options": "ALLOWALL" } });
    const response = await securityHeaders({ event: fakeEvent(), resolve });
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});

describe("shared server hooks: createServerErrorHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a generic message and never leaks the error text", () => {
    const handleError = createServerErrorHandler();
    const result = handleError({ error: new Error("db password wrong"), event: fakeEvent(), status: 500, message: "x" });
    expect(result).toEqual({ message: "An unexpected error occurred" });
  });

  it("logs Error instances directly", () => {
    const err = new Error("boom");
    createServerErrorHandler()({ error: err, event: fakeEvent(), status: 500, message: "x" });
    expect(log.error).toHaveBeenCalledWith("Server error:", err);
  });

  it("wraps non-Error values in a details object", () => {
    createServerErrorHandler()({ error: "string failure", event: fakeEvent(), status: 500, message: "x" });
    expect(log.error).toHaveBeenCalledWith("Server error:", { details: "string failure" });
  });
});
