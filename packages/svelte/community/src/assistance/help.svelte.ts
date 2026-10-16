/**
 * A student's help request on a lab step: the help control's state in the reader. A signed-in
 * student asks as stuck, needing a hint or needing the lecturer, sees how long they have waited,
 * withdraws or marks it solved, reads a lecturer's typed hint on the step and says once whether the
 * help helped (Rules 0397 to 0399). The control is hidden in anonymous mode and for visitors.
 *
 * The request is read from stored rows through the reader's GET /api/assistance/mine: a student's
 * reader never hears the course's queue (Rule 0392), so while a request is live it is read again
 * every HELP_POLL_MS.
 */
import * as env from "$app/env/public";
import { rune } from "@tutors/runes";
import { awaitsRating, isLive, type HelpKind, type HelpRequest } from "./help-request.ts";
import { waitingMs } from "./waiting.ts";
import { sameStep, type StepRef } from "./step-ref.ts";
import { readerHelpDesk, type HelpDesk, type HelpDeskRefusal, type HelpDeskResult } from "./desk.ts";

export { HELP_KINDS, isLive, type HelpKind } from "./help-request.ts";
export { stepRef } from "./step-ref.ts";

/** How often a live request is read again, to hear it was acknowledged, answered or resolved. */
export const HELP_POLL_MS = 30_000;

/** What the service reaches: the help desk, the clock, and whether the reader runs in anonymous mode. */
export type HelpServiceDeps = { desk: HelpDesk; nowMs: () => number; anonymous: boolean };

/** The service over `deps`, read at each use so a test can hand in its own. */
export function createHelpService(deps: () => HelpServiceDeps) {
  /** True when the help control is offered: someone is signed in and the reader is not anonymous (Rule 0399). */
  const available = rune(false);
  /** The step on screen, or null away from a lab. */
  const step = rune<StepRef | null>(null);
  /** The student's own request in the course: live, or just resolved. */
  const request = rune<HelpRequest | null>(null);
  const sending = rune(false);
  /** Why the last ask was not kept, or null (Rule 0394: the student is told and offered a retry). */
  const failure = rune<HelpDeskRefusal | null>(null);
  /** Requests whose "did it help?" the student answered or closed in this session: asked once (Rule 0398). */
  const settled = rune<string[]>([]);
  /** Requests whose hint the student closed. */
  const hintsClosed = rune<string[]>([]);

  let courseRead: string | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  /** The last action that was not kept, sent again by retry() (Rule 0561). */
  let lastFailed: (() => Promise<boolean>) | null = null;
  let reads = 0;

  function stopPolling(): void {
    if (poll) clearInterval(poll);
    poll = null;
  }

  function keepPolling(): void {
    // Only while the student is on a lab: an action that answers after they left starts no poll.
    const live = step.value !== null && request.value !== null && isLive(request.value);
    if (live && !poll) poll = setInterval(() => void refresh(), HELP_POLL_MS);
    if (!live) stopPolling();
  }

  function show(next: HelpRequest | null): void {
    request.value = next;
    keepPolling();
  }

  /** Reads the student's own request again; a failed read keeps what is on screen. */
  async function refresh(): Promise<void> {
    const ref = step.value;
    if (!ref || !available.value) return;
    const mine = ++reads;
    try {
      const read = await deps().desk.mine(ref.courseId);
      if (mine === reads && step.value?.courseId === ref.courseId) show(read);
    } catch {
      // The request on screen stays until a read answers.
    }
  }

  async function act(run: () => Promise<HelpDeskResult>, again: () => Promise<boolean>): Promise<boolean> {
    sending.value = true;
    // A read that started before this action would show the request as it was: its answer is dropped.
    reads++;
    try {
      const result = await run();
      if (!result.ok) {
        failure.value = result.reason;
        lastFailed = again;
        // The request moved on elsewhere (another tab, the lecturer): show where it is now.
        if (result.reason === "not-in-state-table" || result.reason === "conflict") await refresh();
        return false;
      }
      failure.value = null;
      lastFailed = null;
      show(result.request);
      return true;
    } finally {
      sending.value = false;
    }
  }

  return {
    available,
    step,
    request,
    sending,
    failure,

    /**
     * The student arrived at a lab step. Signed in, their request in the course is read (once per
     * course; the poll keeps it fresh); signed out or anonymous, the control is hidden (Rule 0399).
     */
    async arrive(ref: StepRef, signedIn: boolean): Promise<void> {
      const returning = step.value === null;
      step.value = ref;
      const offered = signedIn && !deps().anonymous;
      if (!offered) {
        available.value = false;
        courseRead = null;
        show(null);
        return;
      }
      available.value = true;
      if (courseRead === ref.courseId) {
        // Back on a lab of the same course after leaving: the request may have moved on meanwhile (Rule 0562).
        if (returning) await refresh();
        else keepPolling();
        return;
      }
      courseRead = ref.courseId;
      failure.value = null;
      show(null);
      await refresh();
    },

    refresh,

    /** Asks for help on the step on screen, or asks again with another kind (Rules 0385, 0386). */
    async ask(kind: HelpKind): Promise<boolean> {
      const ref = step.value;
      if (!ref || !available.value || sending.value) return false;
      return act(() => deps().desk.ask(ref, kind), () => this.ask(kind));
    },

    /** Sends the last action that was not kept again (Rule 0561): an ask, a withdraw, a solved or a rating. */
    async retry(): Promise<boolean> {
      return lastFailed ? lastFailed() : false;
    },

    /** The student takes their request back. */
    async withdraw(): Promise<boolean> {
      const live = request.value;
      if (!live || !isLive(live)) return false;
      return act(() => deps().desk.act(live.id, "withdraw"), () => this.withdraw());
    },

    /** The student says they solved it themselves: the request is resolved, and they are asked whether that helped. */
    async solved(): Promise<boolean> {
      const live = request.value;
      if (!live || !isLive(live)) return false;
      return act(() => deps().desk.act(live.id, "resolve"), () => this.solved());
    },

    /** The student says whether the help helped; asked once (Rule 0398). */
    async rate(helped: boolean): Promise<boolean> {
      const resolved = request.value;
      if (!resolved || !awaitsRating(resolved) || sending.value) return false;
      const kept = await act(() => deps().desk.rate(resolved.id, helped), () => this.rate(helped));
      // Asked once: settled only when the answer was kept, so a failed rating can be sent again.
      if (kept && !settled.value.includes(resolved.id)) settled.value = [...settled.value, resolved.id];
      return kept;
    },

    /** The student closed the question without answering: not asked again in this session. */
    dismiss(): void {
      const shown = request.value;
      if (shown && !settled.value.includes(shown.id)) settled.value = [...settled.value, shown.id];
    },

    /** The student closed the lecturer's hint. */
    closeHint(): void {
      const shown = request.value;
      if (shown && !hintsClosed.value.includes(shown.id)) hintsClosed.value = [...hintsClosed.value, shown.id];
    },

    /** Forgets why the last ask failed. */
    clearFailure(): void {
      failure.value = null;
    },

    /** How long the live request has waited, from the clock (Rule 0387). */
    waitedMs(): number {
      const live = request.value;
      return live && isLive(live) ? waitingMs(live, deps().nowMs()) : 0;
    },

    /** The lecturer's typed hint, on the step it was asked from, until the student closes it (Rule 0397). */
    hint(): string | null {
      const shown = request.value;
      const ref = step.value;
      if (!shown || !ref || shown.closed?.reason !== "hint" || !shown.hintText || !sameStep(shown.ref, ref)) return null;
      return hintsClosed.value.includes(shown.id) ? null : shown.hintText;
    },

    /** True once the student's answer to "did it help?" was kept in this session, however it was sent. */
    thanked(): boolean {
      const shown = request.value;
      return !!shown && shown.helped !== null && settled.value.includes(shown.id);
    },

    /** True while a resolved request waits for the student to say whether it helped, and they have not closed the question (Rule 0398). */
    asksRating(): boolean {
      const shown = request.value;
      return !!shown && awaitsRating(shown) && !settled.value.includes(shown.id);
    },

    /** Leaves the lab: stops reading the request. */
    leave(): void {
      stopPolling();
      reads++;
      step.value = null;
    },

    /** Forgets everything: for tests and sign-out. */
    reset(): void {
      stopPolling();
      reads++;
      courseRead = null;
      lastFailed = null;
      available.value = false;
      step.value = null;
      request.value = null;
      sending.value = false;
      failure.value = null;
      settled.value = [];
      hintsClosed.value = [];
    }
  };
}

export type HelpService = ReturnType<typeof createHelpService>;

const readerDeps: HelpServiceDeps = { desk: readerHelpDesk(), nowMs: () => Date.now(), anonymous: false };

/** The reader's help service, over its own /api/assistance. */
export const helpService = createHelpService(() => ({ ...readerDeps, anonymous: env.PUBLIC_ANON_MODE === "TRUE" }));
