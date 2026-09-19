import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@tutors/live-events";
import {
  LIVE_EVENTS_CORS_HEADERS,
  MAX_EVENTS_BODY_BYTES,
  createMemoryBus,
  ingestPreflight,
  ingestRequest,
  type Bus
} from "@tutors/live-store";

/**
 * The public ingest endpoint.
 *
 * It takes anonymous input from anywhere, which is the point and also the risk,
 * so the tests are mostly about what it refuses: an oversized body, a payload
 * that is not JSON, and a batch of events it cannot believe.
 */

const ts = "2026-09-17T10:15:42.500Z";
const good = { type: "course.opened", ts, sid: "s1", course: "cs101" };

function collecting(): Bus & { published: LiveEvent[] } {
  const bus = createMemoryBus();
  const published: LiveEvent[] = [];
  return {
    ...bus,
    published,
    async publish(events) {
      published.push(...events);
      await bus.publish(events);
    }
  };
}

function post(body: string): Request {
  return new Request("https://live.example/api/live/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
}

describe("ingest endpoint", () => {
  it("answers the preflight the cross-origin reader needs", () => {
    const response = ingestPreflight();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("publishes a valid batch and answers 202", async () => {
    const bus = collecting();
    const response = await ingestRequest(post(JSON.stringify([good, { ...good, type: "session.heartbeat" }])), bus);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 2, rejected: 0 });
    expect(bus.published.map((event) => event.type)).toEqual(["course.opened", "session.heartbeat"]);
  });

  it("publishes the good half of a mixed batch and reports the rest", async () => {
    const bus = collecting();
    const rejections: number[] = [];
    const response = await ingestRequest(post(JSON.stringify([good, { type: "nonsense" }])), bus, {
      onRejected: (rejected) => rejections.push(rejected.length)
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 1, rejected: 1 });
    expect(bus.published).toHaveLength(1);
    expect(rejections).toEqual([1]);
  });

  it("publishes nothing and answers 400 when the whole batch is unusable", async () => {
    const bus = collecting();
    const response = await ingestRequest(post(JSON.stringify([{ type: "nonsense" }])), bus);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ accepted: 0, rejected: 1 });
    expect(bus.published).toEqual([]);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const bus = collecting();
    const response = await ingestRequest(post("<html>nope</html>"), bus);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ reason: "body is not JSON" });
    expect(bus.published).toEqual([]);
  });

  it("refuses an oversized body without parsing it", async () => {
    const bus = collecting();
    const response = await ingestRequest(post("x".repeat(MAX_EVENTS_BODY_BYTES + 1)), bus);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ reason: "body too large" });
    expect(bus.published).toEqual([]);
  });

  it("refuses a cross-site form post, the check exporting OPTIONS opts the route out of", async () => {
    const bus = collecting();
    const formPost = new Request("https://live.example/api/live/events", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://attacker.example" },
      body: "runway=csrf"
    });

    const response = await ingestRequest(formPost, bus);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "cross-site form post" });
    expect(bus.published).toEqual([]);
  });

  it("lets a same-origin form post through to ordinary validation, and never a cross-origin one", async () => {
    const bus = collecting();
    const sameOrigin = new Request("https://live.example/api/live/events", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://live.example" },
      body: JSON.stringify([good])
    });
    expect((await ingestRequest(sameOrigin, bus)).status).toBe(202);

    const noOrigin = new Request("https://live.example/api/live/events", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify([good])
    });
    expect((await ingestRequest(noOrigin, bus)).status).toBe(403);
  });

  it("accepts cross-origin JSON, which is the whole reason the route opts out", async () => {
    const bus = collecting();
    const crossOrigin = new Request("https://live.example/api/live/events", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://reader.tutors.dev" },
      body: JSON.stringify([good])
    });
    expect((await ingestRequest(crossOrigin, bus)).status).toBe(202);
  });

  it("carries the CORS headers on every answer, including the refusals", async () => {
    const bus = collecting();
    for (const body of [JSON.stringify([good]), "not json", "x".repeat(MAX_EVENTS_BODY_BYTES + 1)]) {
      const response = await ingestRequest(post(body), bus);
      for (const [header, value] of Object.entries(LIVE_EVENTS_CORS_HEADERS)) {
        expect(response.headers.get(header)).toBe(value);
      }
    }
  });
});
