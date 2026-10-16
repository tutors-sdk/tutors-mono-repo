/**
 * The browser's side of help requests: the reader's /api/assistance as a HelpDesk (readerHelpDesk),
 * Tutors Live's watch of a course's help queue topic (watchHelpQueue), and the reader server's
 * parsing of a rating and its answer to Tutors Live's origin.
 */
import "../../bdd/support/svelte-runes-shim.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { subscribed, watchLiveTopic } = vi.hoisted(() => ({
  subscribed: [] as Array<{ topic: string; onMessage: (event: string, payload: unknown) => void; close: () => Promise<void> }>,
  watchLiveTopic: vi.fn(async (_topic: string, _watcher: string) => "normal")
}));
vi.mock("../../../packages/svelte/community/src/services/realtime.ts", () => ({
  realtime: {
    subscribe: (topic: string, handlers: { onMessage: (event: string, payload: unknown) => void }) => {
      const entry = { topic, onMessage: handlers.onMessage, close: vi.fn(async () => {}) };
      subscribed.push(entry);
      return entry;
    }
  }
}));
vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", () => ({ watchLiveTopic }));
vi.mock("$app/env/public", () => ({ PUBLIC_LIVE_ORIGIN: "https://live.invalid/", PUBLIC_READER_ORIGIN: "https://reader.invalid" }));
vi.mock("$app/env/private", () => ({ PRIVATE_SUPABASE_SERVICE_ROLE_KEY: "" }));

import { readerHelpDesk } from "../../../packages/svelte/community/src/assistance/desk.ts";
import { helpQueueService, placeOf, watchHelpQueue } from "../../../packages/svelte/community/src/assistance/live-queue.ts";
import { LIVE_WATCH_MS } from "../../../packages/svelte/community/src/services/live-feed.ts";
import { allowedOrigin, liveOrigin, parseHelpPost } from "../../../apps/reader/src/lib/server/assistance.ts";
import { OPTIONS } from "../../../apps/reader/src/routes/api/assistance/+server.ts";

const ref = { courseId: "cs101", labRoute: "/lab/cs101/lab-01", stepId: "02" };
const request = { id: "help-1", ref, learnerId: "alice", kind: "stuck", state: "open" };

describe("readerHelpDesk", () => {
  type Call = { url: string; init: RequestInit };
  let calls: Call[];
  const answering = (...responses: Array<Response | Error>) => {
    calls = [];
    return (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = responses.shift();
      if (!next || next instanceof Error) throw next ?? new Error("no answer");
      return next;
    }) as typeof fetch;
  };

  it("posts each ask to the reader's own origin with the page's session", async () => {
    const desk = readerHelpDesk("", answering(Response.json({ request }, { status: 201 }), Response.json({ request }), Response.json({ request }), Response.json({ request })));
    expect(await desk.ask(ref, "stuck")).toEqual({ ok: true, request });
    await desk.act("help-1", "withdraw");
    await desk.answerHint("help-1", "Look again");
    await desk.rate("help-1", true);
    expect(calls.map((c) => [c.url, c.init.credentials, JSON.parse(String(c.init.body))])).toEqual([
      ["/api/assistance", "same-origin", { action: "request", courseId: "cs101", labRoute: "/lab/cs101/lab-01", stepId: "02", kind: "stuck" }],
      ["/api/assistance", "same-origin", { action: "withdraw", id: "help-1" }],
      ["/api/assistance", "same-origin", { action: "answer-hint", id: "help-1", hintText: "Look again" }],
      ["/api/assistance", "same-origin", { action: "rate", id: "help-1", helped: true }]
    ]);
  });

  it("names why an ask was not kept", async () => {
    const desk = readerHelpDesk(
      "",
      answering(
        Response.json({ message: "sign in" }, { status: 401 }),
        Response.json({ reason: "conflict" }, { status: 409 }),
        Response.json({ message: "not kept" }, { status: 503 }),
        Response.json({ message: "bad" }, { status: 400 }),
        new Response("oops", { status: 500 }),
        new Error("offline")
      )
    );
    const reasons = [];
    for (let i = 0; i < 6; i++) reasons.push(await desk.act("help-1", "resolve"));
    expect(reasons).toEqual(["signed-out", "conflict", "not-kept", "invalid", "unavailable", "unavailable"].map((reason) => ({ ok: false, reason })));
  });

  it("reads the student's own request, nobody signed in having none", async () => {
    const desk = readerHelpDesk("", answering(Response.json({ request }), Response.json({ request: null }), new Response(null, { status: 401 }), new Response(null, { status: 503 })));
    expect(await desk.mine("cs 101")).toEqual(request);
    expect(calls[0].url).toBe("/api/assistance/mine?courseId=cs%20101");
    expect(await desk.mine("cs101")).toBeNull();
    expect(await desk.mine("cs101")).toBeNull();
    await expect(desk.mine("cs101")).rejects.toThrow(/could not be read/);
  });

  it("reads the queue from Tutors Live with the lecturer's reader session", async () => {
    const desk = readerHelpDesk("https://reader.invalid", answering(Response.json({ queue: [{ request, waitingMs: 0, escalation: "none" }] }), new Response(null, { status: 403 })));
    expect(await desk.queue("cs101")).toEqual([request]);
    expect(calls[0]).toMatchObject({ url: "https://reader.invalid/api/assistance?courseId=cs101", init: { credentials: "include" } });
    await expect(desk.queue("cs101")).rejects.toThrow(/could not be read/);
  });
});

describe("Tutors Live's help queue topic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribed.length = 0;
    watchLiveTopic.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("hears the course's notices, ignores anything else, and reports itself as a watcher each minute", async () => {
    const heard: unknown[] = [];
    const stop = watchHelpQueue("cs101", (change) => heard.push(change));
    expect(subscribed.map((s) => s.topic)).toEqual(["assistance:cs101"]);
    const { onMessage } = subscribed[0];
    const close = vi.spyOn(subscribed[0], "close");
    onMessage("help-request", { courseId: "cs101", id: "help-1", state: "acknowledged" });
    onMessage("help-request", { courseId: "cs102", id: "help-2", state: "open" });
    onMessage("help-request", { courseId: "cs101", id: 3, state: "open" });
    onMessage("help-request", { courseId: "cs101", id: "help-3", state: "lost" });
    onMessage("help-request", null);
    expect(heard).toEqual([{ id: "help-1", state: "acknowledged" }]);
    expect(watchLiveTopic).toHaveBeenCalledTimes(1);
    expect(watchLiveTopic.mock.calls[0][0]).toBe("assistance:cs101");
    await vi.advanceTimersByTimeAsync(LIVE_WATCH_MS);
    expect(watchLiveTopic).toHaveBeenCalledTimes(2);
    stop();
    expect(close).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LIVE_WATCH_MS * 2);
    expect(watchLiveTopic).toHaveBeenCalledTimes(2);
  });

  it("names a request's lab and step for the queue", () => {
    expect(placeOf(ref)).toEqual({ lab: "lab-01", step: "02" });
    expect(helpQueueService.status.value).toBe("idle");
  });
});

describe("the reader's /api/assistance for ratings and Tutors Live", () => {
  it("reads a rating", () => {
    expect(parseHelpPost({ action: "rate", id: "help-1", helped: false })).toEqual({ action: "rate", id: "help-1", helped: false });
    expect(parseHelpPost({ action: "rate", id: "help-1", helped: "yes" })).toBe("helped is true or false");
    expect(parseHelpPost({ action: "rate" })).toBe("id is required");
    expect(parseHelpPost({ action: "panic" })).toMatch(/rate/);
  });

  it("answers its own pages, and Tutors Live with credentials where the route allows it", () => {
    const url = new URL("https://reader.invalid/api/assistance");
    const from = (origin?: string) => new Request(url, { headers: origin ? { origin } : {} });
    expect(liveOrigin()).toBe("https://live.invalid");
    expect(allowedOrigin(from(), url, true)).toEqual({});
    expect(allowedOrigin(from("https://reader.invalid"), url, false)).toEqual({});
    expect(allowedOrigin(from("https://live.invalid"), url, true)).toEqual({
      "access-control-allow-origin": "https://live.invalid",
      "access-control-allow-credentials": "true",
      vary: "Origin"
    });
    expect(allowedOrigin(from("https://live.invalid"), url, false)).toBeNull();
    expect(allowedOrigin(from("https://elsewhere.invalid"), url, true)).toBeNull();
  });

  it("answers Tutors Live's preflight and refuses any other origin's", async () => {
    const url = new URL("https://reader.invalid/api/assistance");
    const preflight = (origin: string) => OPTIONS({ request: new Request(url, { method: "OPTIONS", headers: { origin } }), url } as never);
    const live = await preflight("https://live.invalid");
    expect(live.status).toBe(204);
    expect(live.headers.get("access-control-allow-methods")).toBe("GET, POST");
    expect(live.headers.get("access-control-allow-credentials")).toBe("true");
    expect((await preflight("https://elsewhere.invalid")).status).toBe(403);
  });
});
