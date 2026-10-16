/**
 * A help request a signed-in student raises on a lab step, and the state table it moves through.
 * There is one live request per student per course: asking again changes its kind and keeps its
 * time (Rule 0386). Waiting time is never stored; it is the clock minus the request time
 * (Rule 0387).
 */
import type { StepRef } from "./step-ref.ts";

export const HELP_KINDS = ["stuck", "hint", "lecturer"] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

export const HELP_STATES = ["open", "acknowledged", "resolved", "withdrawn"] as const;
export type HelpState = (typeof HELP_STATES)[number];

export type HelpAction = "acknowledge" | "answer-hint" | "resolve" | "withdraw" | "expire";

/** Who moved a request, and when. */
export type HelpStamp = { by: string; at: string };

/** Why a request is no longer live. */
export type HelpClosure = HelpStamp & { reason: "resolved" | "hint" | "withdrawn" | "expired" };

export type HelpRequest = {
  id: string;
  ref: StepRef;
  learnerId: string;
  learnerName: string | null;
  kind: HelpKind;
  state: HelpState;
  /** When the student first asked, as an ISO instant; asking again keeps it. */
  requestedAt: string;
  acknowledged: HelpStamp | null;
  closed: HelpClosure | null;
  /** The lecturer's typed answer to a Need-a-hint request. */
  hintText: string | null;
};

/** What the student's request carries before the store gives it an id. */
export type NewHelpRequest = Omit<HelpRequest, "id">;

/** The actor of a transition: their login, and whether they act as the course's educator. */
export type HelpActor = { login: string; educator: boolean };

export function isHelpKind(value: unknown): value is HelpKind {
  return typeof value === "string" && (HELP_KINDS as readonly string[]).includes(value);
}

/** Open or acknowledged: the request is still waiting for an end. */
export function isLive(request: HelpRequest): boolean {
  return request.state === "open" || request.state === "acknowledged";
}

/** A new open request at `at` (Rule 0385). */
export function openRequest(ref: StepRef, learner: { login: string; name: string | null }, kind: HelpKind, at: string): NewHelpRequest {
  return { ref, learnerId: learner.login, learnerName: learner.name, kind, state: "open", requestedAt: at, acknowledged: null, closed: null, hintText: null };
}

/**
 * The student asks again while a request is live: the kind and step become the new ones and the
 * request time stays the first one, so asking again never puts a student back in the queue.
 */
export function askAgain(request: HelpRequest, ref: StepRef, kind: HelpKind): HelpRequest {
  return { ...request, ref, kind };
}

export type TransitionRefusal = "not-in-state-table" | "not-permitted" | "hint-required";
export type TransitionResult = { ok: true; request: HelpRequest } | { ok: false; reason: TransitionRefusal };

/**
 * The state table. Each row is the states an action may start from, the state it ends in, and who
 * may take it: the course's educator, the student who asked, or the system (expiry).
 */
const TABLE: Record<HelpAction, { from: readonly HelpState[]; to: HelpState; who: "educator" | "owner" | "educator-or-owner" | "system" }> = {
  acknowledge: { from: ["open"], to: "acknowledged", who: "educator" },
  "answer-hint": { from: ["open", "acknowledged"], to: "resolved", who: "educator" },
  resolve: { from: ["open", "acknowledged"], to: "resolved", who: "educator-or-owner" },
  withdraw: { from: ["open", "acknowledged"], to: "withdrawn", who: "owner" },
  expire: { from: ["open", "acknowledged"], to: "withdrawn", who: "system" }
};

const permitted = (who: (typeof TABLE)[HelpAction]["who"], request: HelpRequest, actor: HelpActor | "system") => {
  if (who === "system") return actor === "system";
  if (actor === "system") return false;
  const owner = actor.login === request.learnerId;
  if (who === "educator") return actor.educator;
  if (who === "owner") return owner;
  return actor.educator || owner;
};

/**
 * Moves a request by one action at `at`, recording who and when (Rule 0389). An action the state
 * table does not allow from the request's state is refused, so a request reaches each state once.
 */
export function transition(request: HelpRequest, action: HelpAction, actor: HelpActor | "system", at: string, hintText?: string): TransitionResult {
  const row = TABLE[action];
  if (!row.from.includes(request.state)) return { ok: false, reason: "not-in-state-table" };
  if (!permitted(row.who, request, actor)) return { ok: false, reason: "not-permitted" };
  const by = actor === "system" ? "system" : actor.login;
  switch (action) {
    case "acknowledge":
      return { ok: true, request: { ...request, state: row.to, acknowledged: { by, at } } };
    case "answer-hint": {
      const text = hintText?.trim();
      if (request.kind !== "hint" || !text) return { ok: false, reason: "hint-required" };
      return { ok: true, request: { ...request, state: row.to, hintText: text, closed: { by, at, reason: "hint" } } };
    }
    case "resolve":
      return { ok: true, request: { ...request, state: row.to, closed: { by, at, reason: "resolved" } } };
    case "withdraw":
      return { ok: true, request: { ...request, state: row.to, closed: { by, at, reason: "withdrawn" } } };
    case "expire":
      return { ok: true, request: { ...request, state: row.to, closed: { by, at, reason: "expired" } } };
  }
}
