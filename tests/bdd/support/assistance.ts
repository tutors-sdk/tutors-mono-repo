/**
 * The Assistance use cases composed over in-memory adapters for one scenario: a store that behaves
 * as assistance_requests does (one live request per learner and course, compare-and-set replace), a
 * feed that keeps what was published, and a clock the scenario sets. `desk(login)` is the HelpDesk a
 * page holds for whoever is signed in: the use cases run as that login, as the reader's
 * /api/assistance runs them.
 */
import {
  acknowledgeHelp,
  answerHint,
  helpQueue,
  isLive,
  myHelpRequest,
  rateHelp,
  requestHelp,
  resolveHelp,
  withdrawHelp,
  type AssistanceDeps,
  type AssistanceFeed,
  type AssistanceStore,
  type Clock,
  type HelpCaller,
  type HelpKind,
  type HelpRequest,
  type NewHelpRequest,
  type StepRef
} from "../../../packages/svelte/community/src/assistance/index.ts";
import type { HelpDesk, HelpDeskResult } from "../../../packages/svelte/community/src/assistance/desk.ts";
import type { HelpQueueChange } from "../../../packages/svelte/community/src/assistance/queue.svelte.ts";

const copy = <T>(value: T): T => structuredClone(value);

class FixedClock implements Clock {
  private at = Date.parse("2026-01-05T09:00:00.000Z");
  now(): Date {
    return new Date(this.at);
  }
  nowMs(): number {
    return this.at;
  }
  set(iso: string): void {
    this.at = Date.parse(iso);
  }
  advance(ms: number): void {
    this.at += ms;
  }
}

class InMemoryAssistanceStore implements AssistanceStore {
  readonly rows: HelpRequest[] = [];
  /** True while the database cannot be reached: every call rejects. */
  unavailable = false;
  private nextId = 1;
  private reachable(): void {
    if (this.unavailable) throw new Error("the database cannot be reached");
  }
  async open(request: NewHelpRequest): Promise<HelpRequest> {
    this.reachable();
    if (this.rows.some((r) => r.ref.courseId === request.ref.courseId && r.learnerId === request.learnerId && isLive(r))) {
      throw new Error("the learner already has a live help request in the course");
    }
    const row: HelpRequest = { ...copy(request), id: `help-${this.nextId++}` };
    this.rows.push(row);
    return copy(row);
  }
  async get(id: string): Promise<HelpRequest | null> {
    this.reachable();
    const row = this.rows.find((r) => r.id === id);
    return row ? copy(row) : null;
  }
  async live(courseId: string): Promise<HelpRequest[]> {
    this.reachable();
    return this.rows.filter((r) => r.ref.courseId === courseId && isLive(r)).map(copy);
  }
  async latest(courseId: string, learnerId: string): Promise<HelpRequest | null> {
    this.reachable();
    const mine = this.rows.filter((r) => r.ref.courseId === courseId && r.learnerId === learnerId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return mine[0] ? copy(mine[0]) : null;
  }
  async replace(next: HelpRequest, prior: HelpRequest): Promise<boolean> {
    this.reachable();
    const index = this.rows.findIndex((r) => r.id === next.id);
    const stored = this.rows[index];
    if (
      index < 0 ||
      stored.state !== prior.state ||
      stored.kind !== prior.kind ||
      stored.ref.labRoute !== prior.ref.labRoute ||
      stored.ref.stepId !== prior.ref.stepId ||
      (stored.helped ?? null) !== (prior.helped ?? null)
    ) {
      return false;
    }
    this.rows[index] = copy(next);
    return true;
  }
}

/** Keeps what was published and, like the course's help queue topic, tells each watcher the request's id and state. */
class InMemoryAssistanceFeed implements AssistanceFeed {
  readonly published: HelpRequest[] = [];
  private readonly watchers = new Set<{ courseId: string; onChange: (change: HelpQueueChange) => void }>();
  async publish(request: HelpRequest): Promise<boolean> {
    this.published.push(copy(request));
    for (const w of this.watchers) if (w.courseId === request.ref.courseId) w.onChange({ id: request.id, state: request.state });
    return true;
  }
  watch(courseId: string, onChange: (change: HelpQueueChange) => void): () => void {
    const watcher = { courseId, onChange };
    this.watchers.add(watcher);
    return () => void this.watchers.delete(watcher);
  }
}

export function assistanceWorld() {
  const clock = new FixedClock();
  const store = new InMemoryAssistanceStore();
  const feed = new InMemoryAssistanceFeed();
  const educators = new Set<string>();
  const deps: AssistanceDeps = { store, feed, clock, educatorsOf: async () => [...educators] };
  const actor = (login: string): HelpCaller => ({ login });
  return {
    clock,
    store,
    feed,
    educators,
    ask: (ref: StepRef, kind: HelpKind, login: string, at: string) => {
      clock.set(at);
      return requestHelp(deps)(ref, kind, { login, name: login.toUpperCase() });
    },
    acknowledge: (id: string, login: string) => acknowledgeHelp(deps)(id, actor(login)),
    answerHint: (id: string, login: string, hint: string) => answerHint(deps)(id, actor(login), hint),
    resolve: (id: string, login: string) => resolveHelp(deps)(id, actor(login)),
    withdraw: (id: string, login: string) => withdrawHelp(deps)(id, actor(login)),
    rate: (id: string, login: string, helped: boolean) => rateHelp(deps)(id, actor(login), helped),
    mine: (courseId: string, login: string) => myHelpRequest(deps)(courseId, login),
    queue: (courseId: string) => helpQueue(deps)(courseId),
    /** The help desk a page holds with `login` signed in (null: nobody), counting what it was asked. */
    desk: (login: string | null) => new WorldDesk(deps, login, educators)
  };
}

const answer = (result: { ok: true; request: HelpRequest } | { ok: false; reason: string }): HelpDeskResult =>
  result.ok ? { ok: true, request: copy(result.request) } : (result as HelpDeskResult);

/** A HelpDesk over the world's use cases, as the reader's server runs them for the session's login. */
export class WorldDesk implements HelpDesk {
  readonly calls = { ask: 0, act: 0, answerHint: 0, rate: 0, mine: 0, queue: 0 };
  constructor(
    private readonly deps: AssistanceDeps,
    readonly login: string | null,
    private readonly educators: Set<string>
  ) {}
  async ask(ref: StepRef, kind: HelpKind): Promise<HelpDeskResult> {
    this.calls.ask++;
    if (!this.login) return { ok: false, reason: "signed-out" };
    return answer(await requestHelp(this.deps)(ref, kind, { login: this.login, name: this.login.toUpperCase() }));
  }
  async act(id: string, action: "acknowledge" | "resolve" | "withdraw"): Promise<HelpDeskResult> {
    this.calls.act++;
    if (!this.login) return { ok: false, reason: "signed-out" };
    const run = action === "acknowledge" ? acknowledgeHelp : action === "resolve" ? resolveHelp : withdrawHelp;
    return answer(await run(this.deps)(id, { login: this.login }));
  }
  async answerHint(id: string, hintText: string): Promise<HelpDeskResult> {
    this.calls.answerHint++;
    if (!this.login) return { ok: false, reason: "signed-out" };
    return answer(await answerHint(this.deps)(id, { login: this.login }, hintText));
  }
  async rate(id: string, helped: boolean): Promise<HelpDeskResult> {
    this.calls.rate++;
    if (!this.login) return { ok: false, reason: "signed-out" };
    return answer(await rateHelp(this.deps)(id, { login: this.login }, helped));
  }
  async mine(courseId: string): Promise<HelpRequest | null> {
    this.calls.mine++;
    if (!this.login) return null;
    return copy(await myHelpRequest(this.deps)(courseId, this.login));
  }
  async queue(courseId: string): Promise<HelpRequest[]> {
    this.calls.queue++;
    if (!this.login || !this.educators.has(this.login)) throw new Error("only an educator of the course reads its queue");
    return (await helpQueue(this.deps)(courseId)).map((entry) => copy(entry.request));
  }
}

export type AssistanceWorld = ReturnType<typeof assistanceWorld>;
