import "../../bdd/support/svelte-runes-shim.ts";
import { describe, expect, it } from "vitest";
import { readerInsightsDesk, type AnnotationFact, type HelpFact, type InsightsAnswer } from "../../../packages/svelte/utils/insights/src/index.ts";
import { createInsightsService } from "../../../packages/svelte/utils/insights/src/service.svelte.ts";
import {
  annotationFactFromRow,
  helpFactFromRow,
  insightsApi,
  insightsPeriod,
  InsightsNotReadyError,
  PAGE_ROWS,
  parseInsightsAsk,
  rankSteps,
  responseTimes,
  studentProgress,
  supabaseInsightsRead,
  waitSeconds,
  type InsightsRead
} from "../../../packages/svelte/utils/insights/src/server/index.ts";

const ref = (stepId: string) => ({ courseId: "cs101", labRoute: "/lab/cs101/lab-01", stepId });
const request = (over: Partial<HelpFact> = {}): HelpFact => ({
  id: "r1",
  ref: ref("02"),
  learnerId: "alice",
  kind: "stuck",
  requestedAt: "2026-01-05T09:00:00.000Z",
  acknowledgedAt: null,
  closedAt: null,
  closedReason: null,
  ...over
});
const note = (over: Partial<AnnotationFact> = {}): AnnotationFact => ({ id: "a1", ref: ref("02"), learnerId: null, createdAt: "2026-01-05T10:00:00.000Z", revokedAt: null, ...over });

describe("insights arithmetic", () => {
  it("leaves a request still waiting out of the waits, and a withdrawn one out of the time to resolve", () => {
    expect(waitSeconds(request())).toBeNull();
    expect(waitSeconds(request({ closedAt: "2026-01-05T09:00:30.000Z", closedReason: "withdrawn" }))).toBe(30);
    const times = responseTimes([request({ closedAt: "2026-01-05T09:05:00.000Z", closedReason: "withdrawn" })]);
    expect(times.stuck.resolve).toEqual({ count: 0, median: null, p90: null });
  });

  it("does not count a revoked annotation as struggle", () => {
    expect(rankSteps([], [note({ revokedAt: "2026-01-05T11:00:00.000Z" })])).toEqual([]);
    expect(rankSteps([], [note()])[0]).toMatchObject({ total: 0, annotations: 1, medianWaitSeconds: null });
  });

  it("counts what reached a student, and nothing revoked or for others", () => {
    const progress = studentProgress(
      "alice",
      [request(), request({ id: "r2", learnerId: "bob", ref: ref("03") })],
      [note(), note({ id: "a2", ref: ref("03") }), note({ id: "a3", learnerId: "alice", ref: ref("09") }), note({ id: "a4", learnerId: "bob" }), note({ id: "a5", revokedAt: "2026-01-05T11:00:00.000Z" })]
    );
    expect(progress).toEqual({ learnerId: "alice", requestsRaised: 1, hintsRead: 0, annotationsReceived: 2 });
  });
});

describe("insightsPeriod and parseInsightsAsk", () => {
  it("bounds the day, the week and the month ending with a real day", () => {
    expect(insightsPeriod("day", "2026-01-05")).toEqual({ from: "2026-01-05T00:00:00.000Z", to: "2026-01-06T00:00:00.000Z" });
    expect(insightsPeriod("month", "2026-01-30")).toEqual({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-31T00:00:00.000Z" });
    expect(insightsPeriod("day", "2026-02-30")).toBeNull();
    expect(insightsPeriod("day", "5 Jan")).toBeNull();
    expect(insightsPeriod("year" as never, "2026-01-05")).toBeNull();
  });

  it("refuses a malformed ask", () => {
    const ask = (q: string) => parseInsightsAsk(new URLSearchParams(q));
    expect(ask("span=day&day=2026-01-05")).toBe("courseId is required");
    expect(ask(`courseId=${"x".repeat(201)}&day=2026-01-05`)).toBe("courseId is required");
    expect(ask("courseId=cs101&span=year&day=2026-01-05")).toMatch(/^span is one of/);
    expect(ask("courseId=cs101&day=2026-13-01")).toMatch(/^day is/);
    expect(ask(`courseId=cs101&day=2026-01-05&learnerId=${"x".repeat(101)}`)).toMatch(/^learnerId/);
    expect(ask("courseId=cs101&day=2026-01-05&learnerId=%20")).toEqual({ courseId: "cs101", span: "day", day: "2026-01-05", learnerId: null });
  });
});

describe("insightsApi", () => {
  const educator = { authLevel: 0, enrollment: { educators: ["ellen"] } };
  const read = (over: Partial<InsightsRead> = {}): InsightsRead => ({ helpRequests: async () => [request()], annotations: async () => [], ...over });
  const get = (deps: Parameters<typeof insightsApi>[0], q = "courseId=cs101&day=2026-01-05", login: string | null = "ellen") =>
    insightsApi(deps).get(new URLSearchParams(q), login ? { login } : null);

  it("answers each refusal with its status and reason", async () => {
    const deps = { read: read(), accessOf: async () => educator };
    expect(await get(deps, undefined, null)).toMatchObject({ status: 401, body: { reason: "signed-out" } });
    expect(await get(deps, "courseId=cs101")).toMatchObject({ status: 400, body: { reason: "invalid" } });
    expect(await get({ ...deps, read: null })).toMatchObject({ status: 503, body: { reason: "not-kept" } });
    expect(await get({ ...deps, accessOf: async () => null })).toMatchObject({ status: 503, body: { reason: "unavailable" } });
    expect(await get(deps, undefined, "alice")).toMatchObject({ status: 403, body: { reason: "forbidden" } });
    const notReady = read({ annotations: async () => Promise.reject(new InsightsNotReadyError()) });
    expect(await get({ ...deps, read: notReady })).toMatchObject({ status: 503, body: { reason: "not-ready" } });
    const broken = read({ helpRequests: async () => Promise.reject(new Error("boom")) });
    expect(await get({ ...deps, read: broken })).toMatchObject({ status: 503, body: { reason: "unavailable" } });
  });

  it("refuses an educator a private course does not admit, and answers one it does", async () => {
    const privateCourse = { authLevel: 1, enrollment: { educators: ["ellen"], whitelist: ["alice"] } };
    expect(await get({ read: read(), accessOf: async () => privateCourse }, undefined, "alice")).toMatchObject({ status: 403 });
    expect(await get({ read: read(), accessOf: async () => privateCourse })).toMatchObject({ status: 200 });
  });

  it("answers a student's progress when one is named", async () => {
    const answer = await get({ read: read(), accessOf: async () => educator }, "courseId=cs101&day=2026-01-05&learnerId=alice");
    expect(answer).toMatchObject({ status: 200, body: { progress: { learnerId: "alice", requestsRaised: 1 } } });
  });
});

describe("supabaseInsightsRead", () => {
  type Query = { view: string; filters: unknown[][]; range?: [number, number] };
  function fake(rows: number, error?: { message: string; code?: string }) {
    const queries: Query[] = [];
    const client = {
      from(view: string) {
        const q: Query = { view, filters: [] };
        queries.push(q);
        const builder = {
          select: () => builder,
          eq: (...a: unknown[]) => (q.filters.push(["eq", ...a]), builder),
          gte: (...a: unknown[]) => (q.filters.push(["gte", ...a]), builder),
          lt: (...a: unknown[]) => (q.filters.push(["lt", ...a]), builder),
          order: () => builder,
          range: (from: number, to: number) => ((q.range = [from, to]), builder),
          then: (resolve: (v: unknown) => void) => {
            if (error) return resolve({ data: null, error });
            const [from, to] = q.range!;
            const page = Array.from({ length: Math.max(0, Math.min(rows, to + 1) - from) }, (_, i) => ({
              id: `r${from + i}`,
              course_id: "cs101",
              lab_route: "/lab/cs101/lab-01",
              step_id: "02",
              learner_id: "alice",
              kind: "stuck",
              requested_at: "2026-01-05 09:00:00+00",
              created_at: "2026-01-05 09:00:00+00"
            }));
            return resolve({ data: page, error: null });
          }
        };
        return builder;
      }
    };
    return { read: supabaseInsightsRead(client as never), queries };
  }
  const period = { from: "2026-01-05T00:00:00.000Z", to: "2026-01-06T00:00:00.000Z" };

  it("reads a period in pages until one comes back short", async () => {
    const { read, queries } = fake(PAGE_ROWS + 5);
    expect(await read.helpRequests("cs101", period)).toHaveLength(PAGE_ROWS + 5);
    expect(queries.map((q) => q.range)).toEqual([
      [0, PAGE_ROWS - 1],
      [PAGE_ROWS, 2 * PAGE_ROWS - 1]
    ]);
    expect(queries[0].filters).toEqual([
      ["eq", "course_id", "cs101"],
      ["gte", "requested_at", period.from],
      ["lt", "requested_at", period.to]
    ]);
  });

  it("rejects as not ready when the views are missing, and with the message otherwise", async () => {
    await expect(fake(0, { message: "relation does not exist", code: "42P01" }).read.annotations("cs101", period)).rejects.toBeInstanceOf(InsightsNotReadyError);
    await expect(fake(0, { message: "timeout" }).read.helpRequests("cs101", period)).rejects.toThrow("timeout");
  });

  it("maps rows with nothing acknowledged or closed", () => {
    expect(helpFactFromRow({ id: 1, course_id: "c", lab_route: "/lab/c/l", step_id: "s", learner_id: "a", kind: "hint", requested_at: "2026-01-05T09:00:00Z" })).toMatchObject({
      id: "1",
      acknowledgedAt: null,
      closedAt: null,
      closedReason: null
    });
    expect(annotationFactFromRow({ id: "a", course_id: "c", lab_route: "/lab/c/l", step_id: "s", created_at: "2026-01-05T09:00:00Z" })).toMatchObject({ learnerId: null, revokedAt: null });
  });
});

describe("readerInsightsDesk", () => {
  const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

  it("asks the reader with the session and reads its answer", async () => {
    let asked: [string, Parameters<typeof fetch>[1]] | null = null;
    const desk = readerInsightsDesk("https://reader.invalid/", async (input, init) => {
      asked = [String(input), init];
      return new Response(JSON.stringify({ period: { from: "a", to: "b" }, progress: { learnerId: "alice" } }));
    });
    expect(await desk.student("cs101", "alice", "week", "2026-01-05")).toEqual({ ok: true, period: { from: "a", to: "b" }, value: { learnerId: "alice" } });
    expect(asked![0]).toBe("https://reader.invalid/api/insights?courseId=cs101&learnerId=alice&span=week&day=2026-01-05");
    expect(asked![1]?.credentials).toBe("include");
  });

  it("turns every failure into a reason", async () => {
    expect(await readerInsightsDesk("r", respond(401, {})).course("c", "day", "d")).toEqual({ ok: false, reason: "signed-out" });
    expect(await readerInsightsDesk("r", respond(503, { reason: "not-ready" })).course("c", "day", "d")).toEqual({ ok: false, reason: "not-ready" });
    expect(await readerInsightsDesk("r", respond(500, { reason: "nonsense" })).course("c", "day", "d")).toEqual({ ok: false, reason: "unavailable" });
    expect(await readerInsightsDesk("r", async () => new Response("not json", { status: 502 })).course("c", "day", "d")).toEqual({ ok: false, reason: "unavailable" });
    expect(await readerInsightsDesk("r", async () => Promise.reject(new Error("offline"))).course("c", "day", "d")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("createInsightsService", () => {
  it("drops an answer that arrives after the page was left or read again", async () => {
    const pending: ((answer: InsightsAnswer<never>) => void)[] = [];
    const desk = { course: () => new Promise<InsightsAnswer<never>>((r) => pending.push(r)), student: () => new Promise<InsightsAnswer<never>>((r) => pending.push(r)) };
    const service = createInsightsService({ desk, now: () => new Date("2026-01-05T12:00:00.000Z") });
    expect(service.endingDay()).toBe("2026-01-05");
    const first = service.openCourse("cs101");
    const second = service.choose("day", "2026-01-04");
    expect(service.endingDay()).toBe("2026-01-04");
    pending[0]({ ok: false, reason: "unavailable" });
    pending[1]({ ok: false, reason: "forbidden" });
    await Promise.all([first, second]);
    expect(service.course.value).toEqual({ loading: false, answer: { ok: false, reason: "forbidden" } });

    const student = service.openStudent("cs101", "alice");
    service.close();
    pending[2]({ ok: false, reason: "forbidden" });
    await student;
    expect(service.student.value.answer).toBeNull();
    await service.choose("week");
    expect(pending).toHaveLength(3);
  });
});
