import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeHelp,
  answerHint,
  askAgain,
  awaitsRating,
  helpQueue,
  isHelpKind,
  isStepRef,
  myHelpRequest,
  openRequest,
  queueOrder,
  rateHelp,
  rateRequest,
  requestHelp,
  resolveHelp,
  shouldEscalate,
  shouldExpire,
  stepRef,
  supabaseAssistanceFeed,
  supabaseAssistanceStore,
  transition,
  waitingMs,
  withdrawHelp,
  type AssistanceClient,
  type AssistanceDeps,
  type AssistanceFeed,
  type AssistanceStore,
  type HelpRequest
} from "../../../packages/svelte/community/src/assistance/index.ts";
import { recorder } from "../../bdd/support/supabase-recorder.ts";

const T0 = "2026-01-05T09:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const ref = { courseId: "cs101", labRoute: "/lab/cs101/lab-01", stepId: "02" };
const alice = { login: "alice", name: "Alice" };

function request(overrides: Partial<HelpRequest> = {}): HelpRequest {
  return { ...openRequest(ref, alice, "stuck", T0), id: "11111111-1111-4111-8111-111111111111", ...overrides };
}

describe("the help request state table", () => {
  const ellen = { login: "ellen", educator: true };
  const owner = { login: "alice", educator: false };
  const bob = { login: "bob", educator: false };

  it("knows its kinds and step references", () => {
    expect(isHelpKind("hint")).toBe(true);
    expect(isHelpKind("panic")).toBe(false);
    expect(isHelpKind(3)).toBe(false);
    expect(stepRef(" cs101 ", "/lab/cs101/lab-01", "02")).toEqual(ref);
    expect(stepRef("cs101", "", "02")).toBeNull();
    expect(isStepRef(ref)).toBe(true);
    expect(isStepRef(null)).toBe(false);
    expect(isStepRef({ courseId: "cs101" })).toBe(false);
  });

  it("lets the owner or an educator resolve, only an educator acknowledge, and only the owner withdraw", () => {
    expect(transition(request(), "resolve", owner, at(1))).toMatchObject({ ok: true, request: { state: "resolved", closed: { by: "alice", reason: "resolved" } } });
    expect(transition(request(), "resolve", bob, at(1))).toEqual({ ok: false, reason: "not-permitted" });
    expect(transition(request(), "acknowledge", owner, at(1))).toEqual({ ok: false, reason: "not-permitted" });
    expect(transition(request(), "withdraw", ellen, at(1))).toEqual({ ok: false, reason: "not-permitted" });
    expect(transition(request(), "expire", ellen, at(1))).toEqual({ ok: false, reason: "not-permitted" });
    expect(transition(request(), "acknowledge", "system", at(1))).toEqual({ ok: false, reason: "not-permitted" });
    expect(transition(request(), "expire", "system", at(1))).toMatchObject({ ok: true, request: { state: "withdrawn", closed: { by: "system", reason: "expired" } } });
  });

  it("answers a hint only on a Need-a-hint request, with text", () => {
    expect(transition(request(), "answer-hint", ellen, at(1), "Look at line 3")).toEqual({ ok: false, reason: "hint-required" });
    expect(transition(request({ kind: "hint" }), "answer-hint", ellen, at(1), "  ")).toEqual({ ok: false, reason: "hint-required" });
    expect(transition(request({ kind: "hint" }), "answer-hint", ellen, at(1), " Look at line 3 ")).toMatchObject({
      ok: true,
      request: { state: "resolved", hintText: "Look at line 3", closed: { by: "ellen", reason: "hint" } }
    });
  });

  it("asks again on the new step and kind, keeping the time", () => {
    const moved = askAgain(request(), { ...ref, stepId: "03" }, "lecturer");
    expect(moved).toMatchObject({ kind: "lecturer", ref: { stepId: "03" }, requestedAt: T0 });
  });
});

describe("waiting time", () => {
  it("never goes negative, escalates lecturer requests only, and expires after 4 hours", () => {
    const now = Date.parse(T0);
    expect(waitingMs(request(), now - 1000)).toBe(0);
    expect(shouldEscalate(request({ kind: "lecturer", state: "resolved" }), now + 60 * 60_000)).toBe("none");
    expect(shouldExpire(request(), now + 4 * 60 * 60_000)).toBe(true);
    expect(shouldExpire(request({ state: "withdrawn" }), now + 5 * 60 * 60_000)).toBe(false);
  });

  it("puts lecturer requests first, then the longest waiting, then by id", () => {
    const a = request({ id: "a", requestedAt: at(5) });
    const b = request({ id: "b", requestedAt: at(1) });
    const c = request({ id: "c", requestedAt: at(9), kind: "lecturer" });
    const d = request({ id: "d", requestedAt: at(1) });
    expect([a, d, c, b].sort(queueOrder).map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
  });
});

/** A store over an array, with failures a test can switch on. */
function memoryStore(rows: HelpRequest[] = []) {
  const failing = { live: false, open: false, get: false, latest: false, replace: false as boolean | "refuse" };
  let next = 1;
  const store: AssistanceStore = {
    async open(r) {
      if (failing.open) throw new Error("down");
      const row = { ...r, id: `help-${next++}` };
      rows.push(row);
      return { ...row };
    },
    async get(id) {
      if (failing.get) throw new Error("down");
      const row = rows.find((r) => r.id === id);
      return row ? { ...row } : null;
    },
    async live(courseId) {
      if (failing.live) throw new Error("down");
      return rows.filter((r) => r.ref.courseId === courseId && (r.state === "open" || r.state === "acknowledged")).map((r) => ({ ...r }));
    },
    async latest(courseId, learnerId) {
      if (failing.latest) throw new Error("down");
      const mine = rows.filter((r) => r.ref.courseId === courseId && r.learnerId === learnerId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      return mine[0] ? { ...mine[0] } : null;
    },
    async replace(nextRow) {
      if (failing.replace === true) throw new Error("down");
      if (failing.replace === "refuse") return false;
      const i = rows.findIndex((r) => r.id === nextRow.id);
      rows[i] = { ...nextRow };
      return true;
    }
  };
  return { store, rows, failing };
}

describe("the help request use cases", () => {
  let clockAt: number;
  const clock = { now: () => new Date(clockAt), nowMs: () => clockAt };
  let feed: AssistanceFeed & { told: HelpRequest[] };

  beforeEach(() => {
    clockAt = Date.parse(T0);
    feed = {
      told: [],
      async publish(r) {
        this.told.push(r);
        return true;
      }
    };
  });

  const deps = (store: AssistanceStore): AssistanceDeps => ({ store, feed, clock, educatorsOf: async () => ["ellen"] });

  it("refuses an invalid ask and answers unavailable when the store fails", async () => {
    const { store, failing } = memoryStore();
    expect(await requestHelp(deps(store))(ref, "panic" as never, alice)).toEqual({ ok: false, reason: "invalid" });
    expect(await requestHelp(deps(store))(ref, "stuck", { login: "", name: null })).toEqual({ ok: false, reason: "invalid" });
    failing.live = true;
    expect(await requestHelp(deps(store))(ref, "stuck", alice)).toEqual({ ok: false, reason: "unavailable" });
    failing.live = false;
    failing.open = true;
    expect(await requestHelp(deps(store))(ref, "stuck", alice)).toEqual({ ok: false, reason: "unavailable" });
    expect(feed.told).toEqual([]);
  });

  it("answers conflict when asking again loses a race", async () => {
    const { store, failing } = memoryStore([request()]);
    failing.replace = "refuse";
    expect(await requestHelp(deps(store))(ref, "hint", alice)).toEqual({ ok: false, reason: "conflict" });
  });

  it("answers conflict when another tab opened the learner's request at the same moment", async () => {
    const { store, rows } = memoryStore();
    store.open = async () => {
      rows.push(request());
      throw new Error("duplicate key");
    };
    expect(await requestHelp(deps(store))(ref, "stuck", alice)).toEqual({ ok: false, reason: "conflict" });
  });

  it("keeps the change when the feed fails", async () => {
    const { store } = memoryStore();
    feed.publish = async () => {
      throw new Error("broker down");
    };
    expect(await requestHelp(deps(store))(ref, "stuck", alice)).toMatchObject({ ok: true });
  });

  it("acts by id: not found, unavailable, conflict, and a lecturer's hint", async () => {
    const { store, failing } = memoryStore([request({ kind: "hint" })]);
    const id = request().id;
    expect(await acknowledgeHelp(deps(store))("missing", { login: "ellen" })).toEqual({ ok: false, reason: "not-found" });
    failing.get = true;
    expect(await resolveHelp(deps(store))(id, { login: "ellen" })).toEqual({ ok: false, reason: "unavailable" });
    failing.get = false;
    failing.replace = "refuse";
    expect(await withdrawHelp(deps(store))(id, { login: "alice" })).toEqual({ ok: false, reason: "conflict" });
    failing.replace = true;
    expect(await withdrawHelp(deps(store))(id, { login: "alice" })).toEqual({ ok: false, reason: "unavailable" });
    failing.replace = false;
    expect(await answerHint(deps(store))(id, { login: "ellen" }, "Check the import")).toMatchObject({ ok: true, request: { hintText: "Check the import" } });
  });

  it("withdraws a request that has waited 4 hours instead of acting on it, and leaves it out of the queue", async () => {
    const { store, rows } = memoryStore([request(), request({ id: "other", learnerId: "bob", requestedAt: at(200) })]);
    clockAt = Date.parse(at(241));
    expect(await acknowledgeHelp(deps(store))(request().id, { login: "ellen" })).toEqual({ ok: false, reason: "not-in-state-table" });
    expect(rows[0]).toMatchObject({ state: "withdrawn", closed: { by: "system", reason: "expired" } });
    expect((await helpQueue(deps(store))("cs101")).map((e) => e.request.id)).toEqual(["other"]);
    expect(await myHelpRequest(deps(store))("cs101", "alice")).toBeNull();
    expect(await myHelpRequest(deps(store))("cs101", "bob")).toMatchObject({ id: "other" });
  });

  it("rates a resolved request once, by the student who asked (Rule 0398)", async () => {
    const resolved = request({ state: "resolved", closed: { by: "ellen", at: at(5), reason: "resolved" } });
    expect(awaitsRating(request())).toBe(false);
    expect(awaitsRating(resolved)).toBe(true);
    expect(rateRequest(request(), "alice", true)).toEqual({ ok: false, reason: "not-in-state-table" });
    expect(rateRequest(resolved, "bob", true)).toEqual({ ok: false, reason: "not-permitted" });
    const { store, rows, failing } = memoryStore([resolved]);
    expect(await rateHelp(deps(store))(resolved.id, { login: "alice" }, "yes" as never)).toEqual({ ok: false, reason: "invalid" });
    expect(await rateHelp(deps(store))("missing", { login: "alice" }, true)).toEqual({ ok: false, reason: "not-found" });
    failing.get = true;
    expect(await rateHelp(deps(store))(resolved.id, { login: "alice" }, true)).toEqual({ ok: false, reason: "unavailable" });
    failing.get = false;
    failing.replace = "refuse";
    expect(await rateHelp(deps(store))(resolved.id, { login: "alice" }, true)).toEqual({ ok: false, reason: "conflict" });
    failing.replace = true;
    expect(await rateHelp(deps(store))(resolved.id, { login: "alice" }, true)).toEqual({ ok: false, reason: "unavailable" });
    failing.replace = false;
    expect(await rateHelp(deps(store))(resolved.id, { login: "alice" }, false)).toMatchObject({ ok: true, request: { helped: false } });
    expect(rows[0].helped).toBe(false);
    expect(await rateHelp(deps(store))(resolved.id, { login: "alice" }, true)).toEqual({ ok: false, reason: "not-in-state-table" });
    expect(feed.told).toEqual([]);
  });

  it("gives the student their just-resolved request while it has a hint to show or a rating to ask for", async () => {
    const hinted = request({ state: "resolved", kind: "hint", hintText: "Check the bound", helped: true, closed: { by: "ellen", at: at(5), reason: "hint" } });
    const { store, rows } = memoryStore([hinted]);
    expect(await myHelpRequest(deps(store))("cs101", "alice")).toMatchObject({ id: hinted.id, hintText: "Check the bound" });
    rows[0] = { ...hinted, hintText: null };
    expect(await myHelpRequest(deps(store))("cs101", "alice")).toBeNull();
    rows[0] = { ...hinted, hintText: null, helped: null };
    expect(await myHelpRequest(deps(store))("cs101", "alice")).toMatchObject({ id: hinted.id });
    clockAt = Date.parse(at(5 + 240));
    expect(await myHelpRequest(deps(store))("cs101", "alice")).toBeNull();
    rows[0] = { ...hinted, state: "withdrawn", closed: { by: "alice", at: at(5), reason: "withdrawn" } };
    expect(await myHelpRequest(deps(store))("cs101", "alice")).toBeNull();
    expect(await myHelpRequest(deps(store))("cs101", "bob")).toBeNull();
  });

  it("keeps an expired request live when its withdrawal was not stored", async () => {
    const { store, failing } = memoryStore([request()]);
    clockAt = Date.parse(at(241));
    failing.replace = "refuse";
    expect((await helpQueue(deps(store))("cs101")).map((e) => e.request.id)).toEqual([request().id]);
  });
});

describe("the Supabase store and feed", () => {
  const client = recorder as unknown as AssistanceClient;

  beforeEach(() => recorder.reset());

  it("round-trips every field, compares the request as read, and refuses ids that are not UUIDs", async () => {
    const store = supabaseAssistanceStore(client);
    const opened = await store.open(openRequest(ref, alice, "hint", T0));
    expect(opened).toMatchObject({ ref, learnerId: "alice", learnerName: "Alice", kind: "hint", state: "open", requestedAt: T0, acknowledged: null, closed: null });
    const acknowledged = { ...opened, state: "acknowledged" as const, acknowledged: { by: "ellen", at: at(1) } };
    expect(await store.replace(acknowledged, opened)).toBe(true);
    expect(await store.replace({ ...acknowledged, state: "resolved", closed: { by: "ellen", at: at(2), reason: "hint" }, hintText: "Try again" }, opened)).toBe(false);
    expect(await store.get(opened.id)).toEqual(acknowledged);
    expect(await store.live("cs101")).toEqual([acknowledged]);
    expect(await store.live("")).toEqual([]);
    expect(await store.get("help-1")).toBeNull();
    expect(await store.get("22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(await store.replace({ ...opened, id: "help-1" }, opened)).toBe(false);
    await expect(store.open({ ...openRequest(ref, alice, "stuck", T0), learnerId: "" })).rejects.toThrow();
    await expect(store.open(openRequest(ref, alice, "stuck", T0))).rejects.toThrow(/duplicate key/);
  });

  it("finds the learner's latest request and keeps a rating only on the rating it was read with", async () => {
    const store = supabaseAssistanceStore(client);
    expect(await store.latest("", "alice")).toBeNull();
    expect(await store.latest("cs101", "alice")).toBeNull();
    const opened = await store.open(openRequest(ref, alice, "stuck", T0));
    const resolved = { ...opened, state: "resolved" as const, closed: { by: "alice", at: at(1), reason: "resolved" as const } };
    expect(await store.replace(resolved, opened)).toBe(true);
    const second = await store.open(openRequest(ref, alice, "hint", at(2)));
    expect(await store.latest("cs101", "alice")).toMatchObject({ id: second.id });
    expect(await store.replace({ ...resolved, helped: true }, resolved)).toBe(true);
    expect(await store.replace({ ...resolved, helped: false }, resolved)).toBe(false);
    expect(await store.replace({ ...resolved, helped: false }, { ...resolved, helped: true })).toBe(true);
    expect(await store.get(opened.id)).toMatchObject({ helped: false });
  });

  it("rejects when Supabase answers with an error", async () => {
    recorder.tableErrors.set("assistance_requests", { message: "connect ECONNREFUSED" });
    await expect(supabaseAssistanceStore(client).live("cs101")).rejects.toThrow(/ECONNREFUSED/);
  });

  it("publishes a notice only when the claim allows it, and reports a failed claim or send", async () => {
    const feed = supabaseAssistanceFeed(client);
    expect(await feed.publish(request())).toBe(false);
    recorder.rows("realtime_watchers").push({ topic: "assistance:cs101", watcher: "tab", seen_at: new Date().toISOString() });
    expect(await feed.publish(request())).toBe(true);
    expect(recorder.sentOn("assistance:cs101").map((m) => m.payload)).toEqual([{ courseId: "cs101", id: request().id, state: "open" }]);
    expect(recorder.liveSpent()).toBe(2);

    recorder.missingFunctions.add("realtime_claim_assistance_publish");
    expect(await feed.publish(request())).toBe(false);
    recorder.missingFunctions.clear();

    const channel = recorder.channel("assistance:cs101");
    vi.spyOn(channel, "httpSend").mockRejectedValueOnce(new Error("broker down"));
    expect(await feed.publish(request())).toBe(false);
  });
});
