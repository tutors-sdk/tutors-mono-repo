/**
 * Lecturer feedback in the reader. On a lab step a signed-in student sees the explanations for
 * everyone on the step above its content and what was addressed to them below it, from one read
 * (Rule 0403), read again every FEEDBACK_POLL_MS while the step stays on screen and visible, without
 * joining a realtime channel (Rule 0404). An educator of the course also gets the step's history,
 * posts and revokes. Elsewhere in the course, an explanation posted since the last look is toasted,
 * naming its step without its text, at most once a minute (Rule 0564). Signing in as someone else
 * forgets what was read for the last person (Rule 0570). Hidden in anonymous mode and for visitors.
 */
import { rune } from "@tutors/runes";
import { isBroadcast, sameStep, type Annotation, type StepRef } from "./annotation.ts";
import { FeedbackReadError, readerFeedbackDesk, type FeedbackDesk, type FeedbackRefusal, type FeedbackResult, type StepFeedbackView } from "./client.ts";

/** How often a step's feedback is read again while it stays on screen (Rule 0404). */
export const FEEDBACK_POLL_MS = 60_000;
/** The least time between two looks for new explanations in a course, so a student gets at most one toast a minute (Rule 0564). */
export const TOAST_CHECK_MS = 60_000;

/** What the toast says: it names the step and links to it; the explanation is read on the step itself. */
export type ExplanationToast = { title: string; description: string; actionUrl: string };

export const EXPLANATION_TOAST = "Your lecturer posted an explanation for everyone on this step";

/** The toast for an explanation: the step's title, the fixed sentence and a link to the step, never the explanation's text (Rule 0564). */
export function explanationToast(annotation: Annotation, stepTitle?: string | null): ExplanationToast {
  const { labRoute, stepId } = annotation.ref;
  let name = stepTitle?.trim();
  if (!name) {
    try {
      name = decodeURIComponent(stepId);
    } catch {
      name = stepId;
    }
  }
  return { title: name.slice(0, 80), description: EXPLANATION_TOAST, actionUrl: `${labRoute}/${stepId}` };
}

const EMPTY: StepFeedbackView = { broadcasts: [], personal: [], history: null };

export type FeedbackServiceDeps = {
  desk?: FeedbackDesk;
  /** False in anonymous mode: nobody is offered feedback. */
  enabled?: () => boolean;
  nowMs?: () => number;
  visible?: () => boolean;
};

export function createFeedbackService({
  desk = readerFeedbackDesk(),
  enabled = () => true,
  nowMs = () => Date.now(),
  visible = () => typeof document === "undefined" || document.visibilityState !== "hidden"
}: FeedbackServiceDeps = {}) {
  /** True when feedback is offered: someone is signed in and the reader is not anonymous. */
  const available = rune(false);
  /** The step on screen, or null away from a lab. */
  const step = rune<StepRef | null>(null);
  /** The step's feedback as the server last answered it. */
  const view = rune<StepFeedbackView>(EMPTY);
  /** Explanations the student hid in this session. */
  const dismissed = rune<string[]>([]);
  /** What the student received in the course, newest first, once read. */
  const received = rune<Annotation[] | null>(null);
  const sending = rune(false);
  /** Why the last post was not kept, or null. */
  const failure = rune<FeedbackRefusal | null>(null);

  let poll: ReturnType<typeof setInterval> | null = null;
  let reads = 0;
  /** Who the feedback in memory was read for. */
  let reader: string | null = null;
  /** Per course: when it was last looked at for new explanations, and the newest explanation seen then. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping for toasts, never rendered
  const looks = new Map<string, { at: number; newest: string | null }>();
  let receivedFor: string | null = null;
  /** True once the server said it keeps no feedback, or nobody is signed in to it, until someone else signs in. */
  let off = false;

  function stopPolling(): void {
    if (poll) clearInterval(poll);
    poll = null;
  }

  /** Someone else signed in (or out): everything read for the last person is forgotten first (Rule 0570). */
  function signedInAs(login: string | null): void {
    if (login !== reader) off = false;
    available.value = !!login && enabled() && !off;
    if (login === reader) return;
    reader = login;
    reads++;
    view.value = EMPTY;
    dismissed.value = [];
    received.value = null;
    receivedFor = null;
    looks.clear();
    failure.value = null;
  }

  /**
   * A read the server refused because feedback is off, not because it failed: off on this server
   * (no service-role key) or for this session, nothing is offered until someone else signs in; off
   * for this course (one the server does not read, or does not admit them to), nothing is offered
   * until the next step or page. Any other failure keeps what is on screen.
   */
  function refused(error: unknown): void {
    if (!(error instanceof FeedbackReadError)) return;
    if (error.reason === "not-kept" || error.reason === "signed-out") off = true;
    else if (error.reason !== "no-course" && error.reason !== "forbidden") return;
    available.value = false;
    stopPolling();
    view.value = EMPTY;
  }

  /** Reads the step's feedback again; a failed read keeps what is on screen. */
  async function refresh(): Promise<void> {
    const ref = step.value;
    if (!ref || !available.value) return;
    const mine = ++reads;
    try {
      const read = await desk.step(ref);
      if (mine === reads && step.value && sameStep(step.value, ref)) view.value = read;
    } catch (error) {
      if (mine === reads) refused(error);
    }
  }

  async function post(run: () => Promise<FeedbackResult>): Promise<boolean> {
    if (sending.value || !available.value) return false;
    sending.value = true;
    try {
      const result = await run();
      failure.value = result.ok ? null : result.reason;
      if (result.ok) await refresh();
      return result.ok;
    } finally {
      sending.value = false;
    }
  }

  return {
    available,
    step,
    view,
    dismissed,
    received,
    sending,
    failure,

    /** The student arrived at a lab step: signed in, its feedback is read at once and every minute while visible. */
    async arrive(ref: StepRef, login: string | null): Promise<void> {
      const moved = !step.value || !sameStep(step.value, ref);
      signedInAs(login);
      step.value = ref;
      if (!available.value) {
        stopPolling();
        view.value = EMPTY;
        return;
      }
      if (moved) {
        view.value = EMPTY;
        failure.value = null;
      }
      poll ??= setInterval(() => visible() && void refresh(), FEEDBACK_POLL_MS);
      await refresh();
    },

    refresh,

    /** The explanations on the step the student has not hidden in this session. */
    banners(): Annotation[] {
      return view.value.broadcasts.filter((a) => !dismissed.value.includes(a.id));
    },

    /** The student hides an explanation for this session; it stays in their received feedback. */
    dismiss(id: string): void {
      if (!dismissed.value.includes(id)) dismissed.value = [...dismissed.value, id];
    },

    /** An educator explains something to everyone on the step: a banner there and a toast elsewhere in the course. */
    broadcast(body: string): Promise<boolean> {
      const ref = step.value;
      return ref ? post(() => desk.annotate(ref, null, body)) : Promise.resolve(false);
    },

    /** An educator writes to one student about the step. */
    annotate(learnerId: string, body: string): Promise<boolean> {
      const ref = step.value;
      return ref && learnerId.trim() ? post(() => desk.annotate(ref, learnerId.trim(), body)) : Promise.resolve(false);
    },

    /** An educator revokes an annotation: students stop seeing it on their next read (Rule 0406). */
    revoke(id: string): Promise<boolean> {
      return post(() => desk.revoke(id));
    },

    /** Reads what the student received in the course, newest first (Rule 0409); a failed read keeps the last one. */
    async readReceived(courseId: string): Promise<Annotation[] | null> {
      if (!available.value || !courseId) return null;
      if (receivedFor !== courseId) {
        received.value = null;
        receivedFor = courseId;
      }
      const who = reader;
      try {
        const read = await desk.received(courseId);
        if (who === reader && receivedFor === courseId) received.value = read;
        return read;
      } catch (error) {
        if (who === reader) refused(error);
        return null;
      }
    },

    /**
     * The reader moved to a page of the course. At most once a minute it looks at what the student
     * received; an explanation posted since the last look, on a step other than the one on screen,
     * gives one toast for the newest of them (Rule 0564). The first look in a course only notes
     * what is there.
     */
    async visit(courseId: string, login: string | null, here: StepRef | null, toast: (annotation: Annotation) => void): Promise<void> {
      signedInAs(login);
      if (!available.value || !courseId) return;
      const last = looks.get(courseId);
      const now = nowMs();
      if (last && now - last.at < TOAST_CHECK_MS) return;
      looks.set(courseId, { at: now, newest: last?.newest ?? null });
      const who = reader;
      const read = await this.readReceived(courseId);
      if (!read || who !== reader) return;
      const explanations = read.filter(isBroadcast);
      const newest = explanations[0]?.createdAt ?? last?.newest ?? null;
      looks.set(courseId, { at: now, newest });
      if (!last) return;
      const fresh = explanations.filter((a) => (last.newest === null || a.createdAt > last.newest) && !(here && sameStep(a.ref, here)));
      if (fresh.length) toast(fresh[0]);
    },

    /** Leaves the lab: stops reading. */
    leave(): void {
      stopPolling();
      reads++;
      step.value = null;
    },

    /** Forgets everything: for tests and sign-out. */
    reset(): void {
      stopPolling();
      signedInAs(null);
      step.value = null;
      sending.value = false;
    }
  };
}

export type FeedbackService = ReturnType<typeof createFeedbackService>;

/** The reader's one feedback service, over its own /api/feedback. */
export const feedbackService = createFeedbackService();
