/**
 * What a page asks of lecturer feedback, over the reader's /api/feedback with the session cookie.
 * The browser never keeps an annotation itself and never reads the table: the reader's server
 * answers as the person signed in (Rule 0565).
 */
import type { Annotation, StepRef } from "./annotation.ts";
import type { StepFeedback } from "./annotation.ts";

/** A step as the person signed in sees it; `history` is every annotation on it, newest first, for an educator of the course. */
export type StepFeedbackView = StepFeedback & { history: Annotation[] | null };

/** Why a post was not kept: the server's reason, or `unavailable` when it could not be reached. */
export type FeedbackRefusal = "invalid" | "forbidden" | "not-found" | "unavailable" | "signed-out" | "not-kept";

export type FeedbackResult = { ok: true; annotation: Annotation } | { ok: false; reason: FeedbackRefusal };

export interface FeedbackDesk {
  /** The step's feedback for the person signed in. Rejects when it could not be read. */
  step(ref: StepRef): Promise<StepFeedbackView>;
  /** What the person signed in received in a course, newest first. Rejects when it could not be read. */
  received(courseId: string): Promise<Annotation[]>;
  /** An educator posts to one student (`learnerId`) or to everyone on the step (null). */
  annotate(ref: StepRef, learnerId: string | null, body: string): Promise<FeedbackResult>;
  /** An educator revokes an annotation (Rule 0406). */
  revoke(id: string): Promise<FeedbackResult>;
}

const REASONS: readonly FeedbackRefusal[] = ["invalid", "forbidden", "not-found", "unavailable", "signed-out", "not-kept"];

/** The desk over the reader's own /api/feedback. */
export function readerFeedbackDesk(fetchFn: typeof fetch = (...args) => fetch(...args), base = "/api/feedback"): FeedbackDesk {
  async function read<T>(url: string): Promise<T> {
    const response = await fetchFn(url, { credentials: "same-origin", headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`feedback read answered ${response.status}`);
    return (await response.json()) as T;
  }

  async function send(body: Record<string, unknown>): Promise<FeedbackResult> {
    try {
      const response = await fetchFn(base, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body)
      });
      const answer = (await response.json().catch(() => ({}))) as { annotation?: Annotation; reason?: string };
      if (response.ok && answer.annotation) return { ok: true, annotation: answer.annotation };
      const reason = REASONS.find((r) => r === answer.reason) ?? "unavailable";
      return { ok: false, reason };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }

  return {
    step: (ref) => read<StepFeedbackView>(`${base}?${new URLSearchParams(ref)}`),
    received: async (courseId) => (await read<{ annotations: Annotation[] }>(`${base}/mine?${new URLSearchParams({ courseId })}`)).annotations,
    annotate: (ref, learnerId, body) => send({ action: "annotate", ...ref, body, ...(learnerId ? { learnerId } : { everyone: true }) }),
    revoke: (id) => send({ action: "revoke", id })
  };
}
