import "../../bdd/support/svelte-runes-shim.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackReadError, readerFeedbackDesk, type Annotation, type FeedbackDesk } from "../../../packages/svelte/utils/feedback/src/index.ts";
import { createFeedbackService, explanationToast, FEEDBACK_POLL_MS } from "../../../packages/svelte/utils/feedback/src/service.svelte.ts";

const ref = { courseId: "cs101", labRoute: "/lab/cs101/lab-01", stepId: "02" };
const broadcast = (id: string, createdAt: string, stepId = "02"): Annotation => ({
  id,
  ref: { ...ref, stepId },
  audience: { kind: "everyone" },
  body: "x",
  authorId: "ellen",
  createdAt,
  revokedAt: null
});

const desk = (over: Partial<FeedbackDesk> = {}): FeedbackDesk => ({
  step: async () => ({ broadcasts: [], personal: [], history: null }),
  received: async () => [],
  annotate: async () => ({ ok: true, annotation: broadcast("a", "2026-01-05T09:00:00.000Z") }),
  revoke: async () => ({ ok: true, annotation: broadcast("a", "2026-01-05T09:00:00.000Z") }),
  ...over
});

afterEach(() => vi.useRealTimers());

describe("readerFeedbackDesk", () => {
  it("reads the step and the received list from /api/feedback with the session cookie", async () => {
    const urls: string[] = [];
    const fetchFn = vi.fn(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      urls.push(url);
      expect(init?.credentials).toBe("same-origin");
      return new Response(JSON.stringify(url.includes("mine") ? { annotations: [] } : { broadcasts: [], personal: [], history: null }));
    });
    const d = readerFeedbackDesk(fetchFn as never);
    await d.step(ref);
    await d.received("cs101");
    expect(urls).toEqual(["/api/feedback?courseId=cs101&labRoute=%2Flab%2Fcs101%2Flab-01&stepId=02", "/api/feedback/mine?courseId=cs101"]);
  });

  it("rejects a read the server refused, with its reason", async () => {
    const d = readerFeedbackDesk((async () => new Response(JSON.stringify({ reason: "not-kept" }), { status: 503 })) as never);
    await expect(d.step(ref)).rejects.toMatchObject({ status: 503, reason: "not-kept" });
    const bare = readerFeedbackDesk((async () => new Response("oops", { status: 502 })) as never);
    await expect(bare.received("cs101")).rejects.toMatchObject({ status: 502, reason: "unavailable" });
  });

  it("posts an annotation for one student or for everyone, and a revoke", async () => {
    const bodies: unknown[] = [];
    const d = readerFeedbackDesk((async (_url: string, init: Parameters<typeof fetch>[1]) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ annotation: broadcast("a", "t") }), { status: 201 });
    }) as never);
    expect((await d.annotate(ref, "alice", "hi")).ok).toBe(true);
    await d.annotate(ref, null, "all");
    await d.revoke("a");
    expect(bodies).toEqual([
      { action: "annotate", ...ref, body: "hi", learnerId: "alice" },
      { action: "annotate", ...ref, body: "all", everyone: true },
      { action: "revoke", id: "a" }
    ]);
  });

  it("names why a post was not kept, and unavailable when the server cannot be reached or answers no reason", async () => {
    const refused = readerFeedbackDesk((async () => new Response(JSON.stringify({ reason: "forbidden" }), { status: 403 })) as never);
    expect(await refused.revoke("a")).toEqual({ ok: false, reason: "forbidden" });
    const odd = readerFeedbackDesk((async () => new Response("not json", { status: 500 })) as never);
    expect(await odd.revoke("a")).toEqual({ ok: false, reason: "unavailable" });
    const down = readerFeedbackDesk((async () => {
      throw new TypeError("offline");
    }) as never);
    expect(await down.revoke("a")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("feedbackService", () => {
  it("keeps what is on screen when a read fails, and polls only while visible", async () => {
    vi.useFakeTimers();
    let visible = true;
    let reads = 0;
    const service = createFeedbackService({
      desk: desk({
        step: async () => {
          reads++;
          if (reads > 1) throw new Error("down");
          return { broadcasts: [broadcast("a", "t")], personal: [], history: null };
        }
      }),
      visible: () => visible
    });
    await service.arrive(ref, "alice");
    await vi.advanceTimersByTimeAsync(FEEDBACK_POLL_MS);
    expect(service.banners()).toHaveLength(1);
    visible = false;
    await vi.advanceTimersByTimeAsync(FEEDBACK_POLL_MS);
    expect(reads).toBe(2);
    service.dismiss("a");
    service.dismiss("a");
    expect(service.banners()).toEqual([]);
    expect(service.dismissed.value).toEqual(["a"]);
    service.reset();
  });

  it("offers nothing when feedback is off, and reads nothing without a step or a course", async () => {
    const step = vi.fn(async () => ({ broadcasts: [], personal: [], history: null }));
    const off = createFeedbackService({ desk: desk({ step }), enabled: () => false });
    await off.arrive(ref, "alice");
    expect(off.available.value).toBe(false);
    expect(await off.readReceived("cs101")).toBeNull();
    await off.visit("cs101", "alice", null, () => {});
    expect(await off.broadcast("x")).toBe(false);
    expect(await off.annotate("alice", "x")).toBe(false);
    await off.refresh();
    expect(step).not.toHaveBeenCalled();
  });

  it("posts as an educator, reads the step again when kept and keeps the reason when refused", async () => {
    const annotate = vi.fn(async () => ({ ok: false as const, reason: "forbidden" as const }));
    const service = createFeedbackService({ desk: desk({ annotate }) });
    await service.arrive(ref, "ellen");
    expect(await service.broadcast("all")).toBe(false);
    expect(service.failure.value).toBe("forbidden");
    expect(await service.annotate("  ", "x")).toBe(false);
    expect(annotate).toHaveBeenCalledTimes(1);
    const ok = createFeedbackService({ desk: desk() });
    await ok.arrive(ref, "ellen");
    expect(await ok.annotate("alice", "hi")).toBe(true);
    expect(await ok.revoke("a")).toBe(true);
    expect(ok.failure.value).toBeNull();
    ok.reset();
    service.reset();
  });

  it("refuses a second post while one is being sent", async () => {
    let release: () => void = () => {};
    const service = createFeedbackService({
      desk: desk({ annotate: () => new Promise((resolve) => (release = () => resolve({ ok: true, annotation: broadcast("a", "t") }))) })
    });
    await service.arrive(ref, "ellen");
    const first = service.broadcast("one");
    expect(await service.broadcast("two")).toBe(false);
    release();
    expect(await first).toBe(true);
    service.reset();
  });

  it("keeps the last received list when a read fails, and forgets it in another course", async () => {
    let fail = false;
    const service = createFeedbackService({
      desk: desk({
        received: async () => {
          if (fail) throw new Error("down");
          return [broadcast("a", "t")];
        }
      })
    });
    await service.arrive(ref, "alice");
    await service.readReceived("cs101");
    fail = true;
    expect(await service.readReceived("cs101")).toBeNull();
    expect(service.received.value).toHaveLength(1);
    await service.readReceived("cs202");
    expect(service.received.value).toBeNull();
    service.reset();
  });

  it("toasts nothing on the first look in a course, and nothing a failed read could not see", async () => {
    let fail = false;
    let list: Annotation[] = [broadcast("old", "2026-01-05T09:00:00.000Z")];
    let now = 0;
    const toasts: Annotation[] = [];
    const service = createFeedbackService({
      desk: desk({
        received: async () => {
          if (fail) throw new Error("down");
          return list;
        }
      }),
      nowMs: () => now
    });
    await service.visit("cs101", "alice", null, (a) => toasts.push(a));
    expect(toasts).toEqual([]);
    list = [broadcast("new", "2026-01-05T09:10:00.000Z", "03"), ...list];
    fail = true;
    now = 60_000;
    await service.visit("cs101", "alice", null, (a) => toasts.push(a));
    expect(toasts).toEqual([]);
    fail = false;
    now = 120_000;
    await service.visit("cs101", "alice", null, (a) => toasts.push(a));
    expect(toasts.map((a) => a.id)).toEqual(["new"]);
    service.reset();
  });

  it("toasts an explanation in a course that had none at the first look", async () => {
    let list: Annotation[] = [];
    let now = 0;
    const toasts: Annotation[] = [];
    const service = createFeedbackService({ desk: desk({ received: async () => list }), nowMs: () => now });
    await service.visit("cs101", "alice", null, (a) => toasts.push(a));
    list = [broadcast("first", "2026-01-05T09:10:00.000Z")];
    now = 60_000;
    await service.visit("cs101", "alice", null, (a) => toasts.push(a));
    expect(toasts.map((a) => a.id)).toEqual(["first"]);
    await service.visit("", "alice", null, (a) => toasts.push(a));
    service.reset();
  });

  it("turns itself off when the server keeps no feedback, until someone else signs in", async () => {
    vi.useFakeTimers();
    const step = vi.fn(async () => {
      throw new FeedbackReadError(503, "not-kept");
    });
    const service = createFeedbackService({ desk: desk({ step }) });
    await service.arrive(ref, "alice");
    expect(service.available.value).toBe(false);
    await vi.advanceTimersByTimeAsync(FEEDBACK_POLL_MS * 2);
    await service.arrive({ ...ref, stepId: "03" }, "alice");
    expect(step).toHaveBeenCalledTimes(1);
    await service.arrive(ref, "bob");
    expect(step).toHaveBeenCalledTimes(2);
    service.reset();
  });

  it("offers nothing on a course the server does not read, and tries again on the next step", async () => {
    vi.useFakeTimers();
    const step = vi.fn(async () => {
      throw new FeedbackReadError(503, "no-course");
    });
    const service = createFeedbackService({ desk: desk({ step, received: step as never }) });
    await service.arrive(ref, "alice");
    expect(service.available.value).toBe(false);
    await vi.advanceTimersByTimeAsync(FEEDBACK_POLL_MS * 2);
    expect(step).toHaveBeenCalledTimes(1);
    await service.visit("cs101", "alice", null, () => {});
    expect(service.available.value).toBe(false);
    await service.arrive({ ...ref, stepId: "03" }, "alice");
    expect(step).toHaveBeenCalledTimes(3);
    service.reset();
  });

  it("keeps what is on screen when a read fails for any other reason", async () => {
    let fail = false;
    const service = createFeedbackService({
      desk: desk({
        step: async () => {
          if (fail) throw new FeedbackReadError(500, "unavailable");
          return { broadcasts: [broadcast("a", "t")], personal: [], history: null };
        }
      })
    });
    await service.arrive(ref, "alice");
    fail = true;
    await service.refresh();
    expect(service.available.value).toBe(true);
    expect(service.banners()).toHaveLength(1);
    service.reset();
  });

  it("names the step in a toast by its title, or its decoded id, and links to it", () => {
    const a = broadcast("a", "t", "Step%20Two");
    expect(explanationToast(a, "  Using fetch  ").title).toBe("Using fetch");
    expect(explanationToast(a).title).toBe("Step Two");
    expect(explanationToast(broadcast("b", "t", "%E0%A4%A")).title).toBe("%E0%A4%A");
    expect(explanationToast(a).actionUrl).toBe("/lab/cs101/lab-01/Step%20Two");
  });
});
