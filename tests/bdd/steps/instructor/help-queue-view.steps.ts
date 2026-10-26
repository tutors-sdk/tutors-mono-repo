/**
 * The help queue in Tutors Live (Rules 0393, 0395, 0396, 0563): helpQueueService over an in-memory
 * help desk and help queue topic, a fixed clock and fake timers.
 */
import "../../support/svelte-runes-shim.ts";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import type { HelpKind } from "../../../../packages/svelte/community/src/assistance/index.ts";
import { createHelpQueueService, type HelpQueueDeps, type QueueRow } from "../../../../packages/svelte/community/src/assistance/queue.svelte.ts";
import { assistanceWorld, type AssistanceWorld } from "../../support/assistance.ts";

const feature = await loadFeature("tests/bdd/features/instructor/help-queue-view.feature");

/** What Tutors Live's page composes: the lecturer's desk, the clock and the course's topic. */
let deps: HelpQueueDeps;
const helpQueueService = createHelpQueueService(() => deps);

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  let world: AssistanceWorld;
  let courseId: string;
  let lecturer: string;
  let online: Set<string>;
  let row: QueueRow;

  AfterEachScenario(() => {
    helpQueueService.reset();
    vi.useRealTimers();
  });

  /** Tutors Live's page opened by the lecturer, hearing the course's topic or not (Live's budget paused). */
  const open = async (hearing: boolean) => {
    helpQueueService.reset();
    deps = {
      desk: world.desk(lecturer),
      nowMs: () => world.clock.nowMs(),
      watch: hearing ? (id, onChange) => world.feed.watch(id, onChange) : () => () => {}
    };
    await helpQueueService.start(courseId);
  };

  Background(({ Given }) => {
    Given("{string} teaches the course {string} and opens its help queue in Tutors Live at {string}", async (_ctx, login: string, course: string, at: string) => {
      vi.useFakeTimers();
      world = assistanceWorld();
      world.clock.set(at);
      world.educators.add(login);
      courseId = course;
      lecturer = login;
      online = new Set();
      await open(true);
    });
  });

  const pass = async (seconds: number) => {
    world.clock.advance(seconds * 1000);
    await vi.advanceTimersByTimeAsync(seconds * 1000);
  };
  const asks = async (_ctx: unknown, learner: string, kind: HelpKind, stepId: string, labRoute: string) => {
    expect((await world.desk(learner).ask({ courseId, labRoute, stepId }, kind)).ok).toBe(true);
  };
  const rows = () => helpQueueService.rows((login) => online.has(login));
  const shows = (_ctx: unknown, learner: string) => expect(rows().map((r) => r.request.learnerId)).toEqual([learner]);
  const latestRow = () => (row = rows()[0]);

  Rule(
    "Tutors shall read a lecturer's help queue from stored rows every 60 seconds and whenever the queue's topic tells of a changed request, and keep the last queue on screen when a read fails.",
    ({ RuleScenario }) => {
      RuleScenario("Without notices a new request shows at the next read", ({ Given, When, Then }) => {
        Given("the help queue hears no notices", () => open(false));
        When("{string} asks for help as {string} on the step {string} of the lab {string}", asks);
        Then("the queue shall show no request", () => expect(rows()).toEqual([]));
        When("{int} seconds pass", (_ctx, seconds: number) => pass(seconds));
        Then("the queue shall show the request of {string}", shows);
      });
      RuleScenario("A notice brings a new request at once", ({ Given, When, Then }) => {
        Given("the help queue hears its topic", () => open(true));
        When("{string} asks for help as {string} on the step {string} of the lab {string}", asks);
        Then("the queue shall show the request of {string}", async (ctx, learner: string) => {
          await vi.advanceTimersByTimeAsync(0);
          shows(ctx, learner);
        });
      });
      RuleScenario("A request withdrawn elsewhere leaves the queue when its notice arrives", ({ Given, And, When, Then }) => {
        Given("the help queue hears its topic", () => open(true));
        And("{string} asks for help as {string} on the step {string} of the lab {string}", asks);
        When("{string} withdraws the request", async (_ctx, learner: string) => {
          await vi.advanceTimersByTimeAsync(0);
          expect(rows()).toHaveLength(1);
          expect((await world.desk(learner).act(world.store.rows[0].id, "withdraw")).ok).toBe(true);
        });
        Then("the queue shall show no request", () => expect(rows()).toEqual([]));
      });
      RuleScenario("A read that fails keeps the last queue", ({ Given, And, When, Then }) => {
        Given("{string} asks for help as {string} on the step {string} of the lab {string}", asks);
        And("{int} seconds pass", (_ctx, seconds: number) => pass(seconds));
        When("the help requests cannot be read", () => {
          world.store.unavailable = true;
        });
        And("{int} more seconds pass", (_ctx, seconds: number) => pass(seconds));
        Then("the queue shall show the request of {string}", shows);
        And("the queue shall say it was last read at {string}", (_ctx, at: string) => {
          expect(helpQueueService.status.value).toBe("stale");
          expect(helpQueueService.readAt.value).toBe(Date.parse(at));
        });
      });
    }
  );

  Rule(
    "Tutors shall show a lecturer, for each open request, the student's name, the lab and step, the kind of help, the waiting time updating each second, and whether the student is still online.",
    ({ RuleScenario }) => {
      RuleScenario("A request shows who, where, what and how long, and the time moves", ({ Given, And, When, Then }) => {
        Given("the help queue hears its topic", () => open(true));
        And("{string} is online on the course", (_ctx, learner: string) => void online.add(learner));
        When("{string} asks for help as {string} on the step {string} of the lab {string}", asks);
        And("{int} seconds pass", (_ctx, seconds: number) => pass(seconds));
        Then("the queue's row shall show {string}, the lab {string}, the step {string} and the kind {string}", (_ctx, name: string, labRoute: string, stepId: string, kind: string) => {
          latestRow();
          expect(row.request).toMatchObject({ learnerName: name, kind, ref: { labRoute, stepId } });
        });
        And("the row shall have waited {int} seconds", (_ctx, seconds: number) => expect(latestRow().waitingMs).toBe(seconds * 1000));
        And("the row shall show the student online", () => expect(latestRow().online).toBe(true));
        When("{int} second passes", (_ctx, seconds: number) => pass(seconds));
        Then("the row shall have waited {int} seconds", (_ctx, seconds: number) => expect(latestRow().waitingMs).toBe(seconds * 1000));
      });
      RuleScenario("A student who left the course shows offline", ({ Given, When, Then }) => {
        Given("the help queue hears its topic", () => open(true));
        When("{string} asks for help as {string} on the step {string} of the lab {string}", asks);
        Then("the row shall show the student offline", () => expect(latestRow().online).toBe(false));
      });
    }
  );

  Rule("Tutors shall order the help queue by lecturer requests first, then by waiting time, longest first.", ({ RuleScenario }) => {
    RuleScenario("Lecturer requests lead, then the longest waiting", ({ Given, When, And, Then }) => {
      Given("the help queue hears its topic", () => open(true));
      When("{string} asks for help as {string} on the step {string} of the lab {string}", asks);
      And("{int} seconds pass", (_ctx, seconds: number) => pass(seconds));
      And('"bob" asks for help as {string} on the step {string} of the lab {string}', (ctx, kind: HelpKind, stepId: string, labRoute: string) => asks(ctx, "bob", kind, stepId, labRoute));
      And("{int} more seconds pass", (_ctx, seconds: number) => pass(seconds));
      And('"carol" asks for help as {string} on the step {string} of the lab {string}', (ctx, kind: HelpKind, stepId: string, labRoute: string) => asks(ctx, "carol", kind, stepId, labRoute));
      Then("the queue shall list {string}, {string}, {string} in that order", (_ctx, a: string, b: string, c: string) => {
        expect(rows().map((r) => r.request.learnerId)).toEqual([a, b, c]);
      });
    });
  });

  Rule("If a request's stored lab or step is not valid URL-encoded text, then tutors shall show it in the help queue as stored.", ({ RuleScenario }) => {
    const names = (_ctx: unknown, lab: string, step: string) => expect(latestRow().where).toEqual({ lab, step });
    RuleScenario("A malformed step shows as stored", ({ Given, When, Then }) => {
      Given("the help queue hears its topic", () => open(true));
      When("{string} asks for help as {string} on the step {string} of the lab {string}", asks);
      Then("the queue's row shall name the lab {string} and the step {string}", names);
    });
    RuleScenario("An encoded step shows decoded", ({ Given, When, Then }) => {
      Given("the help queue hears its topic", () => open(true));
      When("{string} asks for help as {string} on the step {string} of the lab {string}", asks);
      Then("the queue's row shall name the lab {string} and the step {string}", names);
    });
  });
});
