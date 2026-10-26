/**
 * The help-request use cases: a student asks, asks again or withdraws; a lecturer acknowledges,
 * answers a hint or resolves; the queue is read with waiting time from the clock and forgotten
 * requests withdrawn on read, so nothing needs a scheduler. Each change is told to the course's
 * watchers through AssistanceFeed; a feed that fails does not undo the change.
 */
import { askAgain, isHelpKind, isLive, openRequest, transition, type HelpAction, type HelpActor, type HelpKind, type HelpRequest, type TransitionRefusal } from "./help-request.ts";
import { queueOrder, shouldEscalate, shouldExpire, waitingMs, type Escalation } from "./waiting.ts";
import type { AssistanceFeed, AssistanceStore, Clock } from "./ports.ts";
import { isStepRef, type StepRef } from "./step-ref.ts";

export type AssistanceDeps = {
  store: AssistanceStore;
  feed: AssistanceFeed;
  clock: Clock;
  /** The course's educator logins; whether a caller acts as the educator is decided here, never by the caller. */
  educatorsOf: (courseId: string) => Promise<string[]>;
};

export type HelpRefusal = "invalid" | "unavailable" | "not-found" | "conflict" | TransitionRefusal;
export type HelpResult = { ok: true; request: HelpRequest } | { ok: false; reason: HelpRefusal };

const iso = (clock: Clock) => clock.now().toISOString();

/** Tells the course's watchers a request changed; a feed that fails is not the caller's failure. */
const tell = (feed: AssistanceFeed, request: HelpRequest) => feed.publish(request).catch(() => false);

/**
 * Withdraws, as the system, the live requests that have waited 4 hours and tells the course's
 * watchers; resolves the ones still live. A request whose withdrawal was not stored stays live,
 * so what the queue shows is what the store holds.
 */
async function expireStale({ store, feed, clock }: Pick<AssistanceDeps, "store" | "feed" | "clock">, requests: HelpRequest[]): Promise<HelpRequest[]> {
  const now = clock.nowMs();
  const live: HelpRequest[] = [];
  for (const request of requests) {
    if (!shouldExpire(request, now)) {
      live.push(request);
      continue;
    }
    const moved = transition(request, "expire", "system", iso(clock));
    if (!moved.ok) continue;
    const kept = await store.replace(moved.request, request).catch(() => false);
    if (kept) await tell(feed, moved.request);
    else live.push(request);
  }
  return live;
}

/**
 * A signed-in student asks for help on a step (Rule 0385). While one of their requests in the
 * course is live, asking again changes its kind and step and keeps its time (Rule 0386).
 */
export function requestHelp({ store, feed, clock }: Pick<AssistanceDeps, "store" | "feed" | "clock">) {
  return async (ref: StepRef, kind: HelpKind, learner: { login: string; name: string | null }): Promise<HelpResult> => {
    if (!learner.login || !isHelpKind(kind) || !isStepRef(ref)) return { ok: false, reason: "invalid" };
    let request: HelpRequest | undefined;
    try {
      const live = await expireStale({ store, feed, clock }, await store.live(ref.courseId));
      const mine = live.find((r) => r.learnerId === learner.login);
      if (mine) {
        request = askAgain(mine, ref, kind);
        if (!(await store.replace(request, mine))) return { ok: false, reason: "conflict" };
      }
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    if (!request) {
      try {
        request = await store.open(openRequest(ref, learner, kind, iso(clock)));
      } catch {
        // The table refuses a second live request (its unique index): another of the learner's tabs
        // asked at the same moment, and theirs was kept. Anything else means nothing was kept.
        const raced = await store
          .live(ref.courseId)
          .then((live) => live.some((r) => r.learnerId === learner.login))
          .catch(() => false);
        return { ok: false, reason: raced ? "conflict" : "unavailable" };
      }
    }
    await tell(feed, request);
    return { ok: true, request };
  };
}

/** Who is acting: their signed-in login. Whether they are the course's educator is looked up, not taken from them. */
export type HelpCaller = { login: string };

function act(action: HelpAction, { store, feed, clock, educatorsOf }: AssistanceDeps) {
  return async (id: string, caller: HelpCaller, hintText?: string): Promise<HelpResult> => {
    let current: HelpRequest | null;
    let educators: string[];
    try {
      current = await store.get(id);
      if (!current) return { ok: false, reason: "not-found" };
      educators = await educatorsOf(current.ref.courseId);
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    if (shouldExpire(current, clock.nowMs())) {
      await expireStale({ store, feed, clock }, [current]);
      return { ok: false, reason: "not-in-state-table" };
    }
    const actor: HelpActor = { login: caller.login, educator: educators.includes(caller.login) };
    const moved = transition(current, action, actor, iso(clock), hintText);
    if (!moved.ok) return moved;
    const kept = await store.replace(moved.request, current).catch(() => null);
    if (kept === null) return { ok: false, reason: "unavailable" };
    if (!kept) return { ok: false, reason: "conflict" };
    await tell(feed, moved.request);
    return moved;
  };
}

/** A lecturer says they are on the way. */
export const acknowledgeHelp = (deps: AssistanceDeps) => {
  const run = act("acknowledge", deps);
  return (id: string, caller: HelpCaller) => run(id, caller);
};

/** A lecturer answers a Need-a-hint request with a typed hint, which resolves it as helped by a hint. */
export const answerHint = (deps: AssistanceDeps) => {
  const run = act("answer-hint", deps);
  return (id: string, caller: HelpCaller, hintText: string) => run(id, caller, hintText);
};

/** The lecturer, or the student who asked ("Solved"), ends the request. */
export const resolveHelp = (deps: AssistanceDeps) => {
  const run = act("resolve", deps);
  return (id: string, caller: HelpCaller) => run(id, caller);
};

/** The student who asked takes the request back. */
export const withdrawHelp = (deps: AssistanceDeps) => {
  const run = act("withdraw", deps);
  return (id: string, caller: HelpCaller) => run(id, caller);
};

/**
 * The student's own live request in the course, or null, read from stored rows: a student never
 * reads the course's queue (Rule 0392). A request that has waited 4 hours is withdrawn on the way,
 * as the queue does.
 */
export function myHelpRequest({ store, feed, clock }: Pick<AssistanceDeps, "store" | "feed" | "clock">) {
  return async (courseId: string, login: string): Promise<HelpRequest | null> => {
    const live = await expireStale({ store, feed, clock }, await store.live(courseId));
    return live.find((r) => r.learnerId === login) ?? null;
  };
}

/** One row of the lecturer's queue: the request, how long it has waited at this instant, and its escalation. */
export type QueueEntry = { request: HelpRequest; waitingMs: number; escalation: Escalation };

/**
 * The course's live requests in queue order, each with its waiting time and escalation from the
 * clock (Rules 0387, 0388); requests that have waited 4 hours are withdrawn on the way.
 */
export function helpQueue({ store, feed, clock }: Pick<AssistanceDeps, "store" | "feed" | "clock">) {
  return async (courseId: string): Promise<QueueEntry[]> => {
    const live = (await expireStale({ store, feed, clock }, await store.live(courseId))).filter(isLive).sort(queueOrder);
    const now = clock.nowMs();
    return live.map((request) => ({ request, waitingMs: waitingMs(request, now), escalation: shouldEscalate(request, now) }));
  };
}
