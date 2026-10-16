// @vitest-environment happy-dom
/**
 * The help control's state in the reader (helpService) and the lecturer's queue in Tutors Live
 * (helpQueueService), over an in-memory help desk that runs the real Assistance use cases. The BDD
 * features cover what a student and a lecturer see; these cover the edges: reads that answer late,
 * actions that fail and are sent again, leaving and coming back, and the queue's notices.
 */
import "../../bdd/support/svelte-runes-shim.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHelpService, HELP_POLL_MS, type HelpServiceDeps } from "../../../packages/svelte/community/src/assistance/help.svelte.ts";
import { createHelpQueueService, QUEUE_REFRESH_MS, type HelpQueueDeps } from "../../../packages/svelte/community/src/assistance/queue.svelte.ts";
import type { HelpDesk, HelpDeskResult } from "../../../packages/svelte/community/src/assistance/desk.ts";
import type { HelpRequest, StepRef } from "../../../packages/svelte/community/src/assistance/index.ts";
import { assistanceWorld, type AssistanceWorld, type WorldDesk } from "../../bdd/support/assistance.ts";

const REF: StepRef = { courseId: "cs101", labRoute: "/lab/cs101/lab-01", stepId: "step-1" };
const OTHER_STEP: StepRef = { ...REF, stepId: "step-2" };

let world: AssistanceWorld;
let desk: WorldDesk;
let helpDeps: HelpServiceDeps;
let queueDeps: HelpQueueDeps;
const helpService = createHelpService(() => helpDeps);
const helpQueueService = createHelpQueueService(() => queueDeps);

/** A desk whose answers the test hands out one at a time. */
class HeldDesk implements HelpDesk {
  held: Array<() => void> = [];
  constructor(private readonly inner: HelpDesk) {}
  private hold<T>(run: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => this.held.push(() => void run().then(resolve, reject)));
  }
  release(): void {
    this.held.shift()?.();
  }
  ask: HelpDesk["ask"] = (ref, kind) => this.hold(() => this.inner.ask(ref, kind));
  act: HelpDesk["act"] = (id, action) => this.hold(() => this.inner.act(id, action));
  answerHint: HelpDesk["answerHint"] = (id, text) => this.hold(() => this.inner.answerHint(id, text));
  rate: HelpDesk["rate"] = (id, helped) => this.hold(() => this.inner.rate(id, helped));
  mine: HelpDesk["mine"] = (courseId) => this.hold(() => this.inner.mine(courseId));
  queue: HelpDesk["queue"] = (courseId) => this.hold(() => this.inner.queue(courseId));
}

/** A desk that refuses the next call of one method with the given reason, then works. */
function refusing(inner: HelpDesk, method: "ask" | "act" | "rate" | "answerHint", reason: string): HelpDesk {
  let refused = false;
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== method || refused || typeof value !== "function") return typeof value === "function" ? value.bind(target) : value;
      return async (): Promise<HelpDeskResult> => {
        refused = true;
        return { ok: false, reason } as HelpDeskResult;
      };
    }
  });
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The page's desk, and for the queue whether it hears the course's topic. */
function use(helpDesk: HelpDesk, extra: { anonymous?: boolean; hearing?: boolean } = {}) {
  const nowMs = () => world.clock.nowMs();
  helpDeps = { desk: helpDesk, nowMs, anonymous: extra.anonymous ?? false };
  queueDeps = { desk: helpDesk, nowMs, watch: extra.hearing === false ? () => () => {} : (id, onChange) => world.feed.watch(id, onChange) };
}

beforeEach(() => {
  world = assistanceWorld();
  world.educators.add("lect");
  desk = world.desk("anna");
  helpService.reset();
  helpQueueService.reset();
  use(desk);
});

afterEach(() => {
  helpService.reset();
  helpQueueService.reset();
  vi.useRealTimers();
});

describe("helpService: the student's help control", () => {
  it("is hidden for a visitor and in anonymous mode, and reads nothing", async () => {
    await helpService.arrive(REF, false);
    expect(helpService.available.value).toBe(false);
    use(desk, { anonymous: true });
    await helpService.arrive(REF, true);
    expect(helpService.available.value).toBe(false);
    expect(desk.calls.mine).toBe(0);
    expect(await helpService.ask("stuck")).toBe(false);
  });

  it("reads the student's request once per course, and again on refresh", async () => {
    await desk.ask(REF, "stuck");
    await helpService.arrive(REF, true);
    expect(helpService.request.value?.kind).toBe("stuck");
    await helpService.arrive(OTHER_STEP, true);
    expect(desk.calls.mine).toBe(1);
    await helpService.refresh();
    expect(desk.calls.mine).toBe(2);
  });

  it("asks, shows the waiting time, and changes the kind of the live request keeping its time (Rule 0386)", async () => {
    await helpService.arrive(REF, true);
    expect(helpService.waitedMs()).toBe(0);
    expect(await helpService.ask("stuck")).toBe(true);
    const first = helpService.request.value!;
    world.clock.advance(90_000);
    expect(helpService.waitedMs()).toBe(90_000);
    expect(await helpService.ask("lecturer")).toBe(true);
    expect(helpService.request.value).toMatchObject({ id: first.id, kind: "lecturer", requestedAt: first.requestedAt });
  });

  it("withdraws and marks solved only a live request", async () => {
    await helpService.arrive(REF, true);
    expect(await helpService.withdraw()).toBe(false);
    expect(await helpService.solved()).toBe(false);
    await helpService.ask("stuck");
    expect(await helpService.withdraw()).toBe(true);
    expect(helpService.request.value?.state).toBe("withdrawn");
    expect(await helpService.withdraw()).toBe(false);
    await helpService.ask("hint");
    expect(await helpService.solved()).toBe(true);
    expect(helpService.asksRating()).toBe(true);
  });

  it("asks whether the help helped once, settling only when the answer is kept (Rule 0398)", async () => {
    await helpService.arrive(REF, true);
    await helpService.ask("stuck");
    await helpService.solved();
    use(refusing(desk, "rate", "unavailable"));
    expect(await helpService.rate(true)).toBe(false);
    expect(helpService.failure.value).toBe("unavailable");
    expect(helpService.asksRating()).toBe(true);
    expect(await helpService.retry()).toBe(true);
    expect(helpService.request.value?.helped).toBe(true);
    expect(helpService.asksRating()).toBe(false);
    expect(await helpService.rate(false)).toBe(false);
    expect(await helpService.retry()).toBe(false);
  });

  it("closes the rating question without an answer, once", async () => {
    await helpService.arrive(REF, true);
    await helpService.ask("stuck");
    await helpService.solved();
    helpService.dismiss();
    helpService.dismiss();
    expect(helpService.asksRating()).toBe(false);
  });

  it("retries the action that failed, not the last ask (Rule 0561)", async () => {
    await helpService.arrive(REF, true);
    await helpService.ask("stuck");
    use(refusing(desk, "act", "unavailable"));
    expect(await helpService.withdraw()).toBe(false);
    expect(await helpService.retry()).toBe(true);
    expect(helpService.request.value?.state).toBe("withdrawn");
    expect(desk.calls.ask).toBe(1);

    use(refusing(desk, "ask", "unavailable"));
    expect(await helpService.ask("hint")).toBe(false);
    use(refusing(desk, "act", "unavailable"));
    expect(await helpService.retry()).toBe(true);
    expect(helpService.request.value?.kind).toBe("hint");
    expect(await helpService.solved()).toBe(false);
    expect(await helpService.retry()).toBe(true);
    expect(helpService.request.value?.state).toBe("resolved");
    helpService.clearFailure();
    expect(helpService.failure.value).toBeNull();
  });

  it("re-reads the request when an action finds it moved on elsewhere", async () => {
    await helpService.arrive(REF, true);
    await helpService.ask("stuck");
    await world.desk("lect").act(helpService.request.value!.id, "resolve");
    expect(await helpService.withdraw()).toBe(false);
    expect(helpService.failure.value).toBe("not-in-state-table");
    expect(helpService.request.value?.state).toBe("resolved");
  });

  it("keeps the request on screen when a read fails", async () => {
    await helpService.arrive(REF, true);
    await helpService.ask("stuck");
    world.store.unavailable = true;
    await helpService.refresh();
    expect(helpService.request.value?.state).toBe("open");
  });

  it("drops a read that started before an action, so it cannot bring back a closed request", async () => {
    const held = new HeldDesk(desk);
    use(held);
    const arrived = helpService.arrive(REF, true);
    held.release();
    await arrived;
    const asked = helpService.ask("stuck");
    held.release();
    await asked;
    const read = helpService.refresh();
    const withdrawn = helpService.withdraw();
    // The withdraw is kept first; the read, which ran before it, answers last with the request still open.
    held.held.reverse();
    held.release();
    await withdrawn;
    held.release();
    await Promise.all([read, withdrawn]);
    expect(helpService.request.value?.state).toBe("withdrawn");
  });

  it("polls while a request is live, stops on leaving the lab, and resumes on coming back", async () => {
    vi.useFakeTimers();
    await helpService.arrive(REF, true);
    await helpService.ask("stuck");
    const reads = desk.calls.mine;
    await vi.advanceTimersByTimeAsync(HELP_POLL_MS);
    expect(desk.calls.mine).toBe(reads + 1);
    helpService.leave();
    await vi.advanceTimersByTimeAsync(HELP_POLL_MS * 3);
    expect(desk.calls.mine).toBe(reads + 1);
    await helpService.arrive(REF, true); // coming back reads the request at once (Rule 0562)
    expect(desk.calls.mine).toBe(reads + 2);
    await helpService.arrive(OTHER_STEP, true); // moving between steps does not
    await vi.advanceTimersByTimeAsync(HELP_POLL_MS);
    expect(desk.calls.mine).toBe(reads + 3);
    await helpService.withdraw();
    await vi.advanceTimersByTimeAsync(HELP_POLL_MS * 2);
    expect(desk.calls.mine).toBe(reads + 3);
  });

  it("starts no poll when an ask answers after the student left the lab", async () => {
    vi.useFakeTimers();
    const held = new HeldDesk(desk);
    use(held);
    const arrived = helpService.arrive(REF, true);
    held.release();
    await arrived;
    const asked = helpService.ask("stuck");
    helpService.leave();
    held.release();
    expect(await asked).toBe(true);
    expect(helpService.request.value?.state).toBe("open");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("thanks the student once their rating is kept, however it was sent", async () => {
    await helpService.arrive(REF, true);
    expect(helpService.thanked()).toBe(false);
    await helpService.ask("stuck");
    await helpService.solved();
    helpService.dismiss();
    expect(helpService.thanked()).toBe(false);
    helpService.reset();
    await helpService.arrive(REF, true);
    use(refusing(desk, "rate", "unavailable"));
    await helpService.rate(false);
    expect(helpService.thanked()).toBe(false);
    await helpService.retry();
    expect(helpService.thanked()).toBe(true);
  });

  it("shows a lecturer's hint on the step it was asked from until the student closes it (Rule 0397)", async () => {
    await helpService.arrive(REF, true);
    expect(helpService.hint()).toBeNull();
    await helpService.ask("hint");
    await world.desk("lect").answerHint(helpService.request.value!.id, "Check the loop bound");
    await helpService.refresh();
    expect(helpService.hint()).toBe("Check the loop bound");
    await helpService.arrive(OTHER_STEP, true);
    expect(helpService.hint()).toBeNull();
    await helpService.arrive(REF, true);
    helpService.closeHint();
    helpService.closeHint();
    expect(helpService.hint()).toBeNull();
  });

  it("forgets the request when the student signs out", async () => {
    await helpService.arrive(REF, true);
    await helpService.ask("stuck");
    await helpService.arrive(REF, false);
    expect(helpService.request.value).toBeNull();
    helpService.closeHint();
    helpService.dismiss();
    expect(helpService.waitedMs()).toBe(0);
  });
});

describe("helpQueueService: the lecturer's queue", () => {
  const lecturerDesk = () => world.desk("lect");
  const ask = async (who: string, kind: "stuck" | "hint" | "lecturer") => {
    const result = await world.desk(who).ask({ ...REF, stepId: `step-${who}` }, kind);
    if (!result.ok) throw new Error(result.reason);
    return result.request;
  };

  it("reads the queue, lecturer requests first, with waiting times from the ticking clock (Rules 0395, 0396)", async () => {
    vi.useFakeTimers();
    await ask("anna", "stuck");
    world.clock.advance(60_000);
    await ask("bob", "lecturer");
    use(lecturerDesk());
    await helpQueueService.start("cs101");
    expect(helpQueueService.status.value).toBe("ready");
    expect(helpQueueService.rows().map((r) => r.request.learnerId)).toEqual(["bob", "anna"]);
    world.clock.advance(5_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(helpQueueService.rows((login) => login === "anna").map((r) => [r.waitingMs, r.online])).toEqual([
      [5_000, false],
      [65_000, true]
    ]);
  });

  it("is refused when the queue cannot be read, and stale when a later read fails (Rule 0393)", async () => {
    use(desk);
    await helpQueueService.start("cs101");
    expect(helpQueueService.status.value).toBe("refused");
    use(lecturerDesk());
    await helpQueueService.refresh();
    expect(helpQueueService.status.value).toBe("ready");
    world.store.unavailable = true;
    await helpQueueService.refresh();
    expect(helpQueueService.status.value).toBe("stale");
  });

  it("reads on each notice of a live request, drops a closed one at once, and reads again each minute", async () => {
    vi.useFakeTimers();
    const lect = lecturerDesk();
    use(lect);
    await helpQueueService.start("cs101");
    const anna = await ask("anna", "stuck");
    await vi.advanceTimersByTimeAsync(0);
    expect(helpQueueService.requests.value.map((r) => r.id)).toEqual([anna.id]);
    expect(lect.calls.queue).toBe(2);
    await world.feed.publish({ ...anna, ref: { ...anna.ref, courseId: "other" } });
    expect(helpQueueService.requests.value).toHaveLength(1);
    await desk.act(anna.id, "withdraw");
    expect(helpQueueService.requests.value).toHaveLength(0);
    expect(lect.calls.queue).toBe(2);
    await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS);
    expect(lect.calls.queue).toBe(3);
  });

  it("keeps a change heard while a read was in flight over that read's older answer", async () => {
    const lect = lecturerDesk();
    const anna = await ask("anna", "stuck");
    let answer: (rows: HelpRequest[]) => void = () => {};
    use(Object.assign(Object.create(lect), { queue: () => new Promise<HelpRequest[]>((resolve) => (answer = resolve)) }), { hearing: true });
    const started = helpQueueService.start("cs101");
    const snapshot = await lect.queue("cs101"); // the rows as the read saw them
    await desk.act(anna.id, "withdraw"); // heard on the topic while the read is in flight
    answer(snapshot);
    await started;
    expect(snapshot).toHaveLength(1);
    expect(helpQueueService.requests.value).toHaveLength(0);
  });

  it("drops a read that answers after the queue moved to another course", async () => {
    const held = new HeldDesk(lecturerDesk());
    use(held);
    await ask("anna", "stuck");
    const first = helpQueueService.start("cs101");
    const second = helpQueueService.start("cs102");
    held.release();
    held.release();
    await Promise.all([first, second]);
    expect(helpQueueService.courseId.value).toBe("cs102");
    expect(helpQueueService.requests.value).toHaveLength(0);
  });

  it("acknowledges, answers a hint and resolves, one action per request at a time", async () => {
    const anna = await ask("anna", "stuck");
    const bob = await ask("bob", "hint");
    const carol = await ask("carol", "lecturer");
    use(lecturerDesk());
    await helpQueueService.start("cs101");
    expect(await helpQueueService.acknowledge(anna.id)).toBe(true);
    expect(helpQueueService.requests.value.find((r) => r.id === anna.id)?.state).toBe("acknowledged");
    expect(await helpQueueService.answerHint(bob.id, "  ")).toBe(false);
    expect(helpQueueService.failure.value).toBe("hint-required");
    expect(await helpQueueService.answerHint(bob.id, "Look at line 3")).toBe(true);
    expect(helpQueueService.failure.value).toBeNull();
    const held = new HeldDesk(lecturerDesk());
    use(held);
    const resolving = helpQueueService.resolve(carol.id);
    expect(await helpQueueService.resolve(carol.id)).toBe(false);
    held.release();
    expect(await resolving).toBe(true);
    expect(helpQueueService.rows().map((r) => r.request.id)).toEqual([anna.id]);
  });

  it("says when an action was not kept and reads the queue again", async () => {
    const anna = await ask("anna", "stuck");
    use(lecturerDesk());
    await helpQueueService.start("cs101");
    await desk.act(anna.id, "withdraw");
    expect(await helpQueueService.acknowledge(anna.id)).toBe(false);
    expect(helpQueueService.failure.value).toBe("not-in-state-table");
    expect(helpQueueService.requests.value).toHaveLength(0);
  });

  it("does nothing to refresh with no course, and stops reading on reset", async () => {
    vi.useFakeTimers();
    await helpQueueService.refresh();
    expect(helpQueueService.status.value).toBe("idle");
    const lect = lecturerDesk();
    use(lect);
    await helpQueueService.start("cs101");
    helpQueueService.reset();
    await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS * 2);
    expect(lect.calls.queue).toBe(1);
  });
});

describe("the queue's rows", () => {
  it("leaves out requests that are no longer live", async () => {
    use(world.desk("lect"));
    await helpQueueService.start("cs101");
    const closed = { ...((await desk.ask(REF, "stuck")) as { request: HelpRequest }).request, state: "withdrawn" } as HelpRequest;
    helpQueueService.requests.value = [closed];
    expect(helpQueueService.rows()).toEqual([]);
    await flush();
  });
});
