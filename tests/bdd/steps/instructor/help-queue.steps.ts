/** The help queue (Rules 0387 to 0389), through the Assistance use cases over the in-memory adapters. */
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import type { HelpKind, HelpResult, QueueEntry, StepRef } from "../../../../packages/svelte/community/src/assistance/index.ts";
import { assistanceWorld, type AssistanceWorld } from "../../support/assistance.ts";

const feature = await loadFeature("tests/bdd/features/instructor/help-queue.feature");

describeFeature(feature, ({ Background, Rule }) => {
  let world: AssistanceWorld;
  let ref: StepRef;
  let queue: QueueEntry[];
  let results: HelpResult[];
  let writes: ReturnType<typeof vi.spyOn>;

  Background(({ Given, And }) => {
    Given("{string} teaches the course {string}", (_ctx, lecturer: string) => {
      world = assistanceWorld();
      world.educators.add(lecturer);
      results = [];
    });
    And(
      "{string} is signed in and on the step {string} of the lab {string} in the course {string}",
      (_ctx, _learner: string, stepId: string, labRoute: string, courseId: string) => {
        ref = { courseId, labRoute, stepId };
      }
    );
  });

  const asked = async (_ctx: unknown, learner: string, kind: HelpKind, at: string) => {
    expect((await world.ask(ref, kind, learner, at)).ok).toBe(true);
  };
  const readsQueue = async (_ctx: unknown, now: string) => {
    world.clock.set(now);
    writes = vi.spyOn(world.store, "replace");
    queue = await world.queue(ref.courseId);
  };
  const request = () => world.store.rows[0];
  const act = (action: "acknowledge" | "resolve" | "withdraw") => async (_ctx: unknown, login: string, at: string) => {
    world.clock.set(at);
    results.push(await world[action](request().id, login));
  };
  const endedAs = (_ctx: unknown, state: string, login: string, at: string) => {
    expect(request()).toMatchObject({ state, closed: { by: login, at } });
  };
  const acknowledgedBy = (_ctx: unknown, login: string, at: string) => expect(request().acknowledged).toEqual({ by: login, at });
  const refusedSecond = (_ctx: unknown, reason: string) => {
    expect(results[0].ok).toBe(true);
    expect(results[1]).toEqual({ ok: false, reason });
  };

  Rule("Tutors shall compute a request's waiting time from the clock and the request time, never store it.", ({ RuleScenario }) => {
    RuleScenario("Waiting time grows with the clock and nothing is written", ({ Given, When, Then, And }) => {
      Given("{string} asked for help as {string} at {string}", asked);
      When("the clock reads {string} and {string} reads the queue", (ctx, now: string) => readsQueue(ctx, now));
      Then("the request shall have waited {number} seconds", (_ctx, seconds: number) => {
        expect(queue.map((q) => q.waitingMs / 1000)).toEqual([seconds]);
      });
      And("no stored request shall carry a waiting time", () => {
        for (const row of world.store.rows) expect(Object.keys(row).filter((k) => /wait/i.test(k))).toEqual([]);
      });
      And("reading the queue shall have written nothing to the store", () => {
        expect(writes).not.toHaveBeenCalled();
      });
    });
  });

  Rule("While a lecturer request has waited more than 5 minutes, tutors shall mark it escalated; after 10 minutes, urgent.", ({ RuleScenarioOutline }) => {
    RuleScenarioOutline("A lecturer request escalates as it waits", ({ Given, When, Then }, variables) => {
      Given("{string} asked for help as {string} at {string}", asked);
      When('the clock reads "<now>" and {string} reads the queue', (ctx) => readsQueue(ctx, variables.now));
      Then('the request shall be marked "<escalation>"', () => expect(queue.map((q) => q.escalation)).toEqual([variables.escalation]));
    });
    RuleScenarioOutline("A request that has not waited long, or is not for the lecturer, does not escalate", ({ Given, When, Then }, variables) => {
      Given('{string} asked for help as "<kind>" at {string}', (ctx, learner: string, at: string) => asked(ctx, learner, variables.kind as HelpKind, at));
      When('the clock reads "<now>" and {string} reads the queue', (ctx) => readsQueue(ctx, variables.now));
      Then("the request shall be marked {string}", (_ctx, escalation: string) => expect(queue.map((q) => q.escalation)).toEqual([escalation]));
    });
  });

  Rule(
    "When a lecturer acknowledges, resolves or a student withdraws a request, tutors shall move it to that state once, record who and when, and refuse any transition not in the state table.",
    ({ RuleScenario }) => {
      RuleScenario("A lecturer acknowledges and then resolves", ({ Given, When, And, Then }) => {
        Given("{string} asked for help as {string} at {string}", asked);
        When("{string} acknowledges the request at {string}", act("acknowledge"));
        And("{string} resolves the request at {string}", act("resolve"));
        Then("the request shall be {string} by {string} at {string}", endedAs);
        And("the request shall record it was acknowledged by {string} at {string}", acknowledgedBy);
      });
      RuleScenario("A student withdraws their request", ({ Given, When, Then }) => {
        Given("{string} asked for help as {string} at {string}", asked);
        When("{string} withdraws the request at {string}", act("withdraw"));
        Then("the request shall be {string} by {string} at {string}", endedAs);
      });
      RuleScenario("A second acknowledgement is refused", ({ Given, When, And, Then }) => {
        Given("{string} asked for help as {string} at {string}", asked);
        When("{string} acknowledges the request at {string}", act("acknowledge"));
        And("{string} acknowledges the request at {string}", act("acknowledge"));
        Then("the second action shall be refused as {string}", refusedSecond);
        And("the request shall record it was acknowledged by {string} at {string}", acknowledgedBy);
      });
      RuleScenario("A resolved request cannot be withdrawn", ({ Given, When, And, Then }) => {
        Given("{string} asked for help as {string} at {string}", asked);
        When("{string} resolves the request at {string}", act("resolve"));
        And("{string} withdraws the request at {string}", act("withdraw"));
        Then("the second action shall be refused as {string}", refusedSecond);
        And("the request shall be {string} by {string} at {string}", endedAs);
      });
      RuleScenario("Another student cannot withdraw the request", ({ Given, When, Then, And }) => {
        Given("{string} asked for help as {string} at {string}", asked);
        When("{string} withdraws the request at {string}", act("withdraw"));
        Then("the action shall be refused as {string}", (_ctx, reason: string) => expect(results).toEqual([{ ok: false, reason }]));
        And("the request shall still be {string}", (_ctx, state: string) => expect(request().state).toBe(state));
      });
    }
  );
});
