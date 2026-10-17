import { readFileSync } from "node:fs";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { feedbackWorld, type FeedbackWorld } from "../../support/feedback.ts";
import type { Annotation, StepRef } from "../../../../packages/svelte/utils/feedback/src/index.ts";
import type { Answer } from "../../../../packages/svelte/utils/feedback/src/server/index.ts";

const feature = await loadFeature("tests/bdd/features/instructor/contextual-feedback.feature");

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  let world: FeedbackWorld;
  let ref: StepRef;
  let answer: Answer;
  let posted: Annotation | undefined;

  AfterEachScenario(() => {
    vi.useRealTimers();
  });

  const as = (login: string | null) => (login ? { login } : null);
  const annotate = async (login: string | null, audience: { learnerId?: string; everyone?: boolean }, body = "Look again at the loop.") => {
    answer = await world.api().post({ action: "annotate", ...ref, body, ...audience }, as(login));
    if (answer.status === 201) posted = answer.body.annotation as Annotation;
  };

  const forStudent = (_ctx: unknown, login: string, student: string) => annotate(login, { learnerId: student });
  const forEveryone = (_ctx: unknown, login: string) => annotate(login, { everyone: true });
  const forStudentWith = (_ctx: unknown, login: string, student: string, body: string) => annotate(login, { learnerId: student }, body);
  const forEveryoneWith = (_ctx: unknown, login: string, body: string) => annotate(login, { everyone: true }, body);
  const answers = (_ctx: unknown, status: number) => expect(answer.status).toBe(status);
  const nothingStored = () => expect(world.store.all()).toEqual([]);
  const readsStep = async (_ctx: unknown, login: string) => {
    answer = await world.api().step({ ...ref }, as(login));
  };
  const privateCourse = (_ctx: unknown, courseId: string, login: string) => world.makePrivate(courseId, [login]);

  Background(({ Given, And }) => {
    Given("the course {string} is published with {string} as its educator", (_ctx, courseId: string, educator: string) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      world = feedbackWorld();
      world.publish(courseId, [educator]);
      posted = undefined;
    });
    And("the step {string} of the lab {string}", (_ctx, stepId: string, labRoute: string) => {
      ref = { courseId: "cs101", labRoute, stepId };
    });
  });

  const atStepFor = (_ctx: unknown, stepId: string, labRoute: string, to: string) => {
    expect(posted?.ref).toEqual({ courseId: "cs101", labRoute, stepId });
    expect(posted?.audience).toEqual(to === "everyone" ? { kind: "everyone" } : { kind: "student", learnerId: to });
    expect(world.store.all()).toHaveLength(1);
  };

  Rule("Tutors shall anchor an annotation to one lab step, with an audience of one student or everyone on the step.", ({ RuleScenario }) => {
    RuleScenario("An annotation for one student", ({ When, Then, And }) => {
      When("{string} annotates the step for {string}", forStudent);
      Then("the reader shall answer {number}", answers);
      And("the annotation shall be at the step {string} of the lab {string} for {string}", atStepFor);
    });

    RuleScenario("An annotation for everyone on the step", ({ When, Then, And }) => {
      When("{string} annotates the step for everyone on the step", forEveryone);
      Then("the reader shall answer {number}", answers);
      And("the annotation shall be at the step {string} of the lab {string} for {string}", atStepFor);
    });

    RuleScenario("Two audiences are refused", ({ When, Then, And }) => {
      When("{string} annotates the step for {string} and everyone on the step", (_ctx, login: string, student: string) => annotate(login, { learnerId: student, everyone: true }));
      Then("the reader shall answer {number}", answers);
      And("tutors shall have stored no annotation", nothingStored);
    });

    RuleScenario("No audience is refused", ({ When, Then, And }) => {
      When("{string} annotates the step for nobody", (_ctx, login: string) => annotate(login, {}));
      Then("the reader shall answer {number}", answers);
      And("tutors shall have stored no annotation", nothingStored);
    });
  });

  Rule("When an educator posts an annotation, tutors shall store it with the author and the time.", ({ RuleScenario }) => {
    RuleScenario("An annotation is stored as the educator's, at the time it was posted", ({ Given, When, Then }) => {
      Given("the clock reads {string}", (_ctx, at: string) => vi.setSystemTime(new Date(at)));
      When("{string} annotates the step for everyone on the step", forEveryone);
      Then("tutors shall have stored the annotation by {string} at {string}", (_ctx, author: string, at: string) => {
        const [kept] = world.store.all();
        expect(kept.authorId).toBe(author);
        expect(kept.createdAt).toBe(at);
      });
    });
  });

  Rule("If an actor who is not in the course's educator list posts an annotation, then tutors shall refuse it with 403 and store nothing.", ({ RuleScenario }) => {
    RuleScenario("A student cannot annotate", ({ When, Then, And }) => {
      When("{string} annotates the step for everyone on the step", forEveryone);
      Then("the reader shall answer {number}", answers);
      And("tutors shall have stored no annotation", nothingStored);
    });

    RuleScenario("A student cannot revoke", ({ Given, When, Then, And }) => {
      Given("{string} has annotated the step for everyone on the step", forEveryone);
      When("{string} revokes the annotation", async (_ctx, login: string) => {
        answer = await world.api().post({ action: "revoke", id: posted!.id }, as(login));
      });
      Then("the reader shall answer {number}", answers);
      And("the annotation shall not be revoked", () => expect(world.store.all()[0].revokedAt).toBeNull());
    });
  });

  Rule(
    "Tutors shall keep and change lecturer feedback only on the reader's server as the signed-in actor, refusing a visitor who is not signed in with 401, and give a student only the broadcasts and the annotations addressed to them.",
    ({ RuleScenario }) => {
      RuleScenario("A visitor who is not signed in is refused", ({ When, Then, And }) => {
        When("a visitor who is not signed in annotates the step for everyone on the step", () => annotate(null, { everyone: true }));
        Then("the reader shall answer {number}", answers);
        And("tutors shall have stored no annotation", nothingStored);
      });

      RuleScenario("A student reads the broadcast and their own annotation, never another student's", ({ Given, And, When, Then }) => {
        Given("{string} has annotated the step for {string} with {string}", forStudentWith);
        And("{string} has annotated the step for {string} with {string}", forStudentWith);
        And("{string} has annotated the step for everyone on the step with {string}", forEveryoneWith);
        When("{string} reads the step", readsStep);
        Then("the reader shall answer with the broadcast {string} and the annotation {string} only", (_ctx, broadcast: string, personal: string) => {
          expect(answer.status).toBe(200);
          const view = answer.body as { broadcasts: Annotation[]; personal: Annotation[]; history: Annotation[] | null };
          expect(view.broadcasts.map((a) => a.body)).toEqual([broadcast]);
          expect(view.personal.map((a) => a.body)).toEqual([personal]);
          expect(view.history).toBeNull();
        });
      });

      RuleScenario("The table is closed to the anon key every browser holds", ({ Then }) => {
        Then("the feedback migration shall turn row level security on with no policy for the anon key", () => {
          const sql = readFileSync("supabase/migrations/20261018_feedback_annotations.sql", "utf8");
          expect(sql).toMatch(/ALTER TABLE public\.feedback_annotations ENABLE ROW LEVEL SECURITY;/);
          expect(sql).not.toMatch(/CREATE POLICY/i);
          expect(sql).toMatch(/REVOKE ALL ON public\.feedback_annotations FROM %I/);
        });
      });

      RuleScenario("A server without the service-role key keeps no feedback", ({ Given, When, Then }) => {
        Given("the reader's server has no service-role key", () => world.withoutStore());
        When("{string} annotates the step for everyone on the step", forEveryone);
        Then("the reader shall answer {number}", answers);
      });
    }
  );

  Rule("If a signed-in reader is not admitted to a private course, then the reader shall refuse with 403 to read feedback there.", ({ RuleScenario }) => {
    RuleScenario("An outsider reads nothing from a private course", ({ Given, And, When, Then }) => {
      Given("the course {string} is private, admitting {string}", privateCourse);
      And("{string} has annotated the step for everyone on the step with {string}", forEveryoneWith);
      When("{string} reads the step", readsStep);
      Then("the reader shall answer {number}", answers);
    });

    RuleScenario("An outsider reads none of what was received in a private course", ({ Given, When, Then }) => {
      Given("the course {string} is private, admitting {string}", privateCourse);
      When("{string} reads the feedback they received in the course", async (_ctx, login: string) => {
        answer = await world.api().mine("cs101", as(login));
      });
      Then("the reader shall answer {number}", answers);
    });

    RuleScenario("A student on the whitelist reads the course's feedback", ({ Given, And, When, Then }) => {
      Given("the course {string} is private, admitting {string}", privateCourse);
      And("{string} has annotated the step for everyone on the step with {string}", forEveryoneWith);
      When("{string} reads the step", readsStep);
      Then("the reader shall answer {number}", answers);
    });
  });
});
