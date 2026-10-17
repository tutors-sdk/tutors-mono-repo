/**
 * The Assistance use cases composed over in-memory adapters for one scenario: a store that behaves
 * as assistance_requests does (one live request per learner and course, compare-and-set replace), a
 * feed that keeps what was published, and a clock the scenario sets.
 */
import {
  acknowledgeHelp,
  answerHint,
  helpQueue,
  isLive,
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
}

class InMemoryAssistanceStore implements AssistanceStore {
  readonly rows: HelpRequest[] = [];
  private nextId = 1;
  async open(request: NewHelpRequest): Promise<HelpRequest> {
    if (this.rows.some((r) => r.ref.courseId === request.ref.courseId && r.learnerId === request.learnerId && isLive(r))) {
      throw new Error("the learner already has a live help request in the course");
    }
    const row: HelpRequest = { ...copy(request), id: `help-${this.nextId++}` };
    this.rows.push(row);
    return copy(row);
  }
  async get(id: string): Promise<HelpRequest | null> {
    const row = this.rows.find((r) => r.id === id);
    return row ? copy(row) : null;
  }
  async live(courseId: string): Promise<HelpRequest[]> {
    return this.rows.filter((r) => r.ref.courseId === courseId && isLive(r)).map(copy);
  }
  async replace(next: HelpRequest, prior: HelpRequest): Promise<boolean> {
    const index = this.rows.findIndex((r) => r.id === next.id);
    const stored = this.rows[index];
    if (index < 0 || stored.state !== prior.state || stored.kind !== prior.kind || stored.ref.labRoute !== prior.ref.labRoute || stored.ref.stepId !== prior.ref.stepId) {
      return false;
    }
    this.rows[index] = copy(next);
    return true;
  }
}

class InMemoryAssistanceFeed implements AssistanceFeed {
  readonly published: HelpRequest[] = [];
  async publish(request: HelpRequest): Promise<boolean> {
    this.published.push(copy(request));
    return true;
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
    queue: (courseId: string) => helpQueue(deps)(courseId)
  };
}

export type AssistanceWorld = ReturnType<typeof assistanceWorld>;
