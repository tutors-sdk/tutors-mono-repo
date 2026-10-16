/** Help requests in labs (Rules 0385, 0386), through the Assistance use cases over the in-memory adapters. */
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import type { HelpKind, StepRef } from "../../../../packages/svelte/community/src/assistance/index.ts";
import { assistanceWorld, type AssistanceWorld } from "../../support/assistance.ts";

const feature = await loadFeature("tests/bdd/features/student/help-requests.feature");

describeFeature(feature, ({ Background, Rule }) => {
  let world: AssistanceWorld;
  let ref: StepRef;

  Background(({ Given }) => {
    Given(
      "{string} is signed in and on the step {string} of the lab {string} in the course {string}",
      (_ctx, _learner: string, stepId: string, labRoute: string, courseId: string) => {
        world = assistanceWorld();
        ref = { courseId, labRoute, stepId };
      }
    );
  });

  const asks = async (_ctx: unknown, learner: string, kind: HelpKind, at: string) => {
    const result = await world.ask(ref, kind, learner, at);
    expect(result.ok).toBe(true);
  };
  const holdsOne =
    (state: string) =>
    (_ctx: unknown, learner: string, ...rest: string[]) => {
      const [stepId, kind, at] = rest.length === 3 ? rest : [ref.stepId, ...rest];
      const mine = world.store.rows.filter((r) => r.learnerId === learner);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ state, kind, requestedAt: at, ref: { ...ref, stepId } });
    };

  Rule(
    "When a signed-in student on a lab step asks for help as stuck, needing a hint or needing the lecturer, tutors shall open one help request carrying the step reference, the kind and the time of the request.",
    ({ RuleScenarioOutline }) => {
      RuleScenarioOutline("A student asks for help", ({ When, Then }, variables) => {
        When('{string} asks for help as "<kind>" at {string}', (ctx, learner: string, at: string) => asks(ctx, learner, variables.kind as HelpKind, at));
        Then(
          'tutors shall hold one open help request by {string} at the step {string} of kind "<kind>" requested at {string}',
          (ctx, learner: string, stepId: string, at: string) => holdsOne("open")(ctx, learner, stepId, variables.kind, at)
        );
      });
    }
  );

  Rule(
    "If a student asks for help while one of their requests is open or acknowledged in the course, then tutors shall replace its kind and keep the original request time.",
    ({ RuleScenario }) => {
      RuleScenario("Asking again changes the kind", ({ Given, When, Then }) => {
        Given("{string} asked for help as {string} at {string}", asks);
        When("{string} asks for help as {string} at {string}", asks);
        Then("tutors shall hold one open help request by {string} at the step {string} of kind {string} requested at {string}", holdsOne("open"));
      });
      RuleScenario("Asking again after an acknowledgement keeps the request", ({ Given, And, When, Then }) => {
        Given("{string} asked for help as {string} at {string}", asks);
        And("the lecturer {string} acknowledged it", async (_ctx, lecturer: string) => {
          world.educators.add(lecturer);
          expect((await world.acknowledge(world.store.rows[0].id, lecturer)).ok).toBe(true);
        });
        When("{string} asks for help as {string} at {string}", asks);
        Then("tutors shall hold one acknowledged help request by {string} of kind {string} requested at {string}", holdsOne("acknowledged"));
      });
    }
  );
});
