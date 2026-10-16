/**
 * What a page asks of help requests, as the person signed in to the reader: a student asks,
 * withdraws, marks solved and says whether it helped; a lecturer reads the course's queue and
 * acknowledges, answers a hint or resolves. The browser never keeps or moves a request itself: each
 * ask goes to the reader's server (POST /api/assistance), which runs the use cases as the session's
 * actor (Rule 0390) and answers with what was kept. Tutors Live calls the reader from its own origin
 * with the lecturer's reader session.
 */
import type { HelpKind, HelpRequest } from "./help-request.ts";
import type { HelpRefusal } from "./help.ts";
import type { StepRef } from "./step-ref.ts";

/**
 * Why an ask was not kept: the use cases' refusals, plus `signed-out` (nobody is signed in to the
 * reader) and `not-kept` (the reader keeps no help requests).
 */
export type HelpDeskRefusal = HelpRefusal | "signed-out" | "not-kept";

export type HelpDeskResult = { ok: true; request: HelpRequest } | { ok: false; reason: HelpDeskRefusal };

export interface HelpDesk {
  /** Asks for help on a step, or asks again with another kind or step (Rules 0385, 0386). */
  ask(ref: StepRef, kind: HelpKind): Promise<HelpDeskResult>;
  /** Moves a request by id: an educator acknowledges or resolves, the student who asked withdraws or resolves. */
  act(id: string, action: "acknowledge" | "resolve" | "withdraw"): Promise<HelpDeskResult>;
  /** An educator answers a Need-a-hint request with a typed hint. */
  answerHint(id: string, hintText: string): Promise<HelpDeskResult>;
  /** The student who asked says whether a resolved request helped (Rule 0398). */
  rate(id: string, helped: boolean): Promise<HelpDeskResult>;
  /** The signed-in student's own request in the course (live, or just resolved), or null; rejects when it could not be read. */
  mine(courseId: string): Promise<HelpRequest | null>;
  /** The course's live requests, for an educator of the course; rejects when they could not be read or the caller may not read them. */
  queue(courseId: string): Promise<HelpRequest[]>;
}

const REFUSALS: readonly HelpRefusal[] = ["invalid", "unavailable", "not-found", "conflict", "not-in-state-table", "not-permitted", "hint-required"];

/**
 * What the reader answered a post with: the request it kept, or the refusal it named. 401 is nobody
 * signed in; a 503 naming no refusal is a reader that keeps no help requests; a 400 naming none is a
 * post it could not read; anything else (no answer, a refused origin) is "try again".
 */
async function answered(response: Response | null): Promise<HelpDeskResult> {
  if (!response) return { ok: false, reason: "unavailable" };
  const body = (await response.json().catch(() => null)) as { request?: HelpRequest; reason?: string } | null;
  if (response.ok && body?.request) return { ok: true, request: body.request };
  if (response.status === 401) return { ok: false, reason: "signed-out" };
  const named = REFUSALS.find((r) => r === body?.reason);
  if (named) return { ok: false, reason: named };
  if (response.status === 503) return { ok: false, reason: "not-kept" };
  return { ok: false, reason: response.status === 400 ? "invalid" : "unavailable" };
}

/**
 * Help requests through the reader's /api/assistance. `readerOrigin` is empty on the reader's own
 * pages; Tutors Live passes the reader's origin, and its calls carry the lecturer's reader session.
 */
export function readerHelpDesk(readerOrigin = "", fetchFn: typeof fetch = (input, init) => globalThis.fetch(input, init)): HelpDesk {
  const credentials: RequestCredentials = readerOrigin ? "include" : "same-origin";
  const call = (path: string, init: RequestInit = {}) => fetchFn(`${readerOrigin}${path}`, { ...init, credentials }).catch(() => null);
  const post = async (body: Record<string, unknown>) =>
    answered(await call("/api/assistance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const query = (courseId: string) => `courseId=${encodeURIComponent(courseId)}`;
  return {
    ask: (ref, kind) => post({ action: "request", courseId: ref.courseId, labRoute: ref.labRoute, stepId: ref.stepId, kind }),
    act: (id, action) => post({ action, id }),
    answerHint: (id, hintText) => post({ action: "answer-hint", id, hintText }),
    rate: (id, helped) => post({ action: "rate", id, helped }),
    async mine(courseId) {
      const response = await call(`/api/assistance/mine?${query(courseId)}`);
      // Nobody signed in has no request of their own.
      if (response?.status === 401) return null;
      if (!response?.ok) throw new Error("Your help request could not be read");
      return ((await response.json()) as { request: HelpRequest | null }).request ?? null;
    },
    async queue(courseId) {
      const response = await call(`/api/assistance?${query(courseId)}`);
      if (!response?.ok) throw new Error("The help queue could not be read");
      return ((await response.json()) as { queue: Array<{ request: HelpRequest }> }).queue.map((entry) => entry.request);
    }
  };
}
