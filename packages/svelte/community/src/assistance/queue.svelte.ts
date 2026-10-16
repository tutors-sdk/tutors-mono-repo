/**
 * A lecturer's help queue in Tutors Live: the course's live help requests with the student, the lab
 * and step, the kind of help and the waiting time ticking each second (Rule 0395), lecturer requests
 * first and then the longest waiting (Rule 0396), and the lecturer's actions on them: acknowledge,
 * answer a hint request with a typed hint, resolve.
 *
 * The queue is read from stored rows through the reader's GET /api/assistance (educators only)
 * every QUEUE_REFRESH_MS, and again whenever the course's help queue topic tells of a changed
 * request. The notice names only the request's id and state, as the topic is readable with the
 * public key: a request that left the queue goes at once, anything else is read (Rule 0393). A read
 * that fails keeps the queue on screen and says when it was last read.
 */
import { rune } from "@tutors/runes";
import { isLive, type HelpRequest, type HelpState } from "./help-request.ts";
import { queueOrder, shouldEscalate, waitingMs, type Escalation } from "./waiting.ts";
import type { StepRef } from "./step-ref.ts";
import type { HelpDesk, HelpDeskRefusal, HelpDeskResult } from "./desk.ts";

/** How often the queue is read from stored rows, notices or none. */
export const QUEUE_REFRESH_MS = 60_000;
const TICK_MS = 1_000;

/** What the course's help queue topic says of a changed request: its id and state, nothing more. */
export type HelpQueueChange = { id: string; state: HelpState };

/** What the queue reaches: the help desk, the clock, and the course's help queue topic. */
export type HelpQueueDeps = {
  desk: HelpDesk;
  nowMs: () => number;
  /** Hears the course's notices until the returned function is called. */
  watch: (courseId: string, onChange: (change: HelpQueueChange) => void) => () => void;
};

/** Where a request was asked from, as the queue names it: the lab's last route segment and the step. */
export type QueuePlace = { lab: string; step: string };

/** One row of the queue as a lecturer sees it now. */
export type QueueRow = { request: HelpRequest; waitingMs: number; escalation: Escalation; online: boolean; where: QueuePlace };

/** Decoded for reading; a malformed escape shows as stored rather than breaking the queue (Rule 0563). */
function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function placeOf(ref: StepRef): QueuePlace {
  return { lab: decoded(ref.labRoute.split("/").filter(Boolean).pop() ?? ref.labRoute), step: decoded(ref.stepId) };
}

/** The service over `deps`, read at each use so a test can hand in its own. */
export function createHelpQueueService(deps: () => HelpQueueDeps) {
  const courseId = rune<string | null>(null);
  const requests = rune<HelpRequest[]>([]);
  /** The clock, read each second so waiting times move. */
  const now = rune(0);
  /** "loading" before the first read; "ready" after a read; "stale" when the last read failed and an older queue is shown; "refused" when the queue could not be read at all. */
  const status = rune<"idle" | "loading" | "ready" | "stale" | "refused">("idle");
  /** When the queue on screen was last read, in milliseconds. */
  const readAt = rune<number | null>(null);
  /** Requests a lecturer's action is in flight for. */
  const working = rune<string[]>([]);
  /** Why the lecturer's last action was not kept, or null. */
  const failure = rune<HelpDeskRefusal | null>(null);

  let stops: Array<() => void> = [];
  let reads = 0;
  /** Changes known (notices, or the lecturer's own actions) since the read in flight started: reapplied over its answer. */
  let heardSinceRead: Array<HelpRequest | HelpQueueChange> = [];

  /** Puts a changed request into the queue, or takes it out once it is no longer live. */
  function apply(changed: HelpRequest | HelpQueueChange): void {
    const others = requests.value.filter((r) => r.id !== changed.id);
    if ("ref" in changed) requests.value = isLive(changed) ? [...others, changed] : others;
    else if (changed.state !== "open" && changed.state !== "acknowledged") requests.value = others;
  }

  function merge(changed: HelpRequest | HelpQueueChange): void {
    heardSinceRead.push(changed);
    apply(changed);
  }

  async function refresh(): Promise<void> {
    const id = courseId.value;
    if (!id) return;
    const mine = ++reads;
    heardSinceRead = [];
    try {
      const read = await deps().desk.queue(id);
      if (mine !== reads || courseId.value !== id) return;
      // A read answers with the rows as they were when it ran: a change known meanwhile is newer.
      const heard = heardSinceRead;
      heardSinceRead = [];
      requests.value = read;
      for (const changed of heard) apply(changed);
      readAt.value = deps().nowMs();
      status.value = "ready";
    } catch {
      if (mine !== reads || courseId.value !== id) return;
      // The last queue stays on screen (Rule 0393); with none, there is nothing to show.
      status.value = readAt.value === null ? "refused" : "stale";
    }
  }

  /** A notice from the course's topic: a request that left the queue goes now; any other change is read. */
  function hear(change: HelpQueueChange): void {
    merge(change);
    if (change.state === "open" || change.state === "acknowledged") void refresh();
  }

  async function act(id: string, run: () => Promise<HelpDeskResult>): Promise<boolean> {
    if (working.value.includes(id)) return false;
    working.value = [...working.value, id];
    try {
      const result = await run();
      if (!result.ok) {
        failure.value = result.reason;
        await refresh();
        return false;
      }
      failure.value = null;
      if (result.request.ref.courseId === courseId.value) merge(result.request);
      return true;
    } finally {
      working.value = working.value.filter((w) => w !== id);
    }
  }

  function stop(): void {
    for (const s of stops) s();
    stops = [];
    reads++;
    heardSinceRead = [];
  }

  return {
    courseId,
    requests,
    now,
    status,
    readAt,
    working,
    failure,

    /** Starts the queue of a course: reads it, hears its notices, ticks and reads again each minute. */
    async start(id: string): Promise<void> {
      stop();
      courseId.value = id;
      requests.value = [];
      readAt.value = null;
      failure.value = null;
      status.value = "loading";
      now.value = deps().nowMs();
      const unwatch = deps().watch(id, hear);
      const tick = setInterval(() => (now.value = deps().nowMs()), TICK_MS);
      const reread = setInterval(() => void refresh(), QUEUE_REFRESH_MS);
      stops = [unwatch, () => clearInterval(tick), () => clearInterval(reread)];
      await refresh();
    },

    refresh,

    /**
     * The queue now: live requests, lecturer requests first, then the longest waiting (Rules 0395,
     * 0396), each saying whether its student is online by `online`, which the page reads from
     * presence.
     */
    rows(online: (login: string) => boolean = () => false): QueueRow[] {
      const at = now.value;
      return requests.value
        .filter(isLive)
        .sort(queueOrder)
        .map((request) => ({
          request,
          waitingMs: waitingMs(request, at),
          escalation: shouldEscalate(request, at),
          online: online(request.learnerId),
          where: placeOf(request.ref)
        }));
    },

    /** The lecturer says they are on the way. */
    acknowledge(id: string): Promise<boolean> {
      return act(id, () => deps().desk.act(id, "acknowledge"));
    },

    /** The lecturer answers a Need-a-hint request with a hint they type (Rule 0397). */
    answerHint(id: string, hintText: string): Promise<boolean> {
      if (!hintText.trim()) {
        failure.value = "hint-required";
        return Promise.resolve(false);
      }
      return act(id, () => deps().desk.answerHint(id, hintText));
    },

    /** The lecturer resolves the request. */
    resolve(id: string): Promise<boolean> {
      return act(id, () => deps().desk.act(id, "resolve"));
    },

    /** Forgets the course: for tests and leaving the page. */
    reset(): void {
      stop();
      courseId.value = null;
      requests.value = [];
      status.value = "idle";
      readAt.value = null;
      working.value = [];
      failure.value = null;
      now.value = 0;
    }
  };
}
