import { describe, it, expect } from "vitest";
import { createMockFetch } from "../../bdd/support/mocks";

/**
 * Live service tests via createMockFetch.
 *
 * The community package fetches data from various endpoints. These tests
 * validate the mock fetch factory's URL pattern matching, handler types,
 * and 404 fallback behaviour.
 */

describe("live-service: URL pattern matching", () => {
  it("matches a URL pattern and returns the correct response", async () => {
    const mockFetch = createMockFetch({
      "/api/courses": { courses: ["course-1", "course-2"] },
    });

    const response = await mockFetch("/api/courses");
    const data = await response.json();
    expect(data).toEqual({ courses: ["course-1", "course-2"] });
  });

  it("matches partial URL patterns", async () => {
    const mockFetch = createMockFetch({
      "courses": { found: true },
    });

    const response = await mockFetch("https://api.example.com/v2/courses?limit=10");
    const data = await response.json();
    expect(data).toEqual({ found: true });
  });
});

describe("live-service: object handler returns JSON with 200 status", () => {
  it("returns status 200 for object handlers", async () => {
    const mockFetch = createMockFetch({
      "/api/health": { status: "ok" },
    });

    const response = await mockFetch("/api/health");
    expect(response.status).toBe(200);
  });

  it("returns correct Content-Type header", async () => {
    const mockFetch = createMockFetch({
      "/api/data": { key: "value" },
    });

    const response = await mockFetch("/api/data");
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });
});

describe("live-service: function handler receives url and init", () => {
  it("passes url to function handler", async () => {
    let capturedUrl = "";
    const mockFetch = createMockFetch({
      "/api/echo": async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ echoed: url }), { status: 200 });
      },
    });

    await mockFetch("/api/echo?q=test");
    expect(capturedUrl).toBe("/api/echo?q=test");
  });

  it("passes init options to function handler", async () => {
    let capturedMethod = "";
    const mockFetch = createMockFetch({
      "/api/submit": async (_url: string, init?: RequestInit) => {
        capturedMethod = init?.method || "GET";
        return new Response(JSON.stringify({ method: capturedMethod }), { status: 201 });
      },
    });

    const response = await mockFetch("/api/submit", { method: "POST", body: "{}" });
    expect(capturedMethod).toBe("POST");
    expect(response.status).toBe(201);
  });
});

describe("live-service: unmatched URL returns 404", () => {
  it("returns 404 for a URL that matches no pattern", async () => {
    const mockFetch = createMockFetch({
      "/api/courses": { courses: [] },
    });

    const response = await mockFetch("/api/users");
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe("Not Found");
  });

  it("returns 404 when no handlers are registered", async () => {
    const mockFetch = createMockFetch({});
    const response = await mockFetch("/anything");
    expect(response.status).toBe(404);
  });
});

describe("live-service: multiple patterns, first match wins", () => {
  it("returns the first matching handler when multiple patterns match", async () => {
    const mockFetch = createMockFetch({
      "/api": { source: "first" },
      "/api/courses": { source: "second" },
    });

    const response = await mockFetch("/api/courses");
    const data = await response.json();
    expect(data.source).toBe("first");
  });
});
